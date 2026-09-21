import { db } from '@/database'
import logger from '@/lib/logger'
import { extractTextFromLexical } from '@/lib/lexical'
import { generateAnalysis } from './agent'
import type { AnalysisReport, ReviewContent } from './types'
import { getConfigValue } from '@/server/config'
import { isCurrentCodeRound } from '@/server/db/code-round'
import { fetchFileContents } from '@/server/storage'
import { generateDataSourcesContextString } from '@/server/utils'
import { getAgentContextString } from '@/lib/agent-context'

// Booleans are deliberately false so the UI renders red badges: a missing review must not look
// like a passing one.
const DISABLED_REPORT: AnalysisReport = {
    proposalSummary: 'Automated AI review did not run — CLAUDE_API_KEY is not configured for this environment.',
    codeExplanation: 'Manual review required.',
    alignmentCheck: {
        isAligned: false,
        findings: ['Automated review did not run for this submission.'],
    },
    complianceCheck: {
        isCompliant: false,
        findings: ['Automated review did not run for this submission.'],
    },
}

const MAX_FILE_SIZE_BYTES = 100_000
const MAX_FILE_COUNT = 10

export const PLACEHOLDER = '(none provided)'

async function fetchCodeFiles(studyJobId: string): Promise<Record<string, string>> {
    const files = await db
        .selectFrom('studyJobFile')
        .select(['name', 'path'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', 'in', ['MAIN-CODE', 'SUPPLEMENTAL-CODE'])
        .orderBy('fileType', 'desc')
        .orderBy('name', 'asc')
        .limit(MAX_FILE_COUNT)
        .execute()

    const result: Record<string, string> = {}
    for (const file of files) {
        const blob = await fetchFileContents(file.path)
        if (blob.size > MAX_FILE_SIZE_BYTES) {
            logger.warn(`Skipping oversized file for study review`, { name: file.name, size: blob.size, studyJobId })
            continue
        }
        result[file.name] = await blob.text()
    }
    return result
}

function lexicalFieldToText(value: unknown): string {
    if (!value) return ''
    return extractTextFromLexical(typeof value === 'string' ? value : JSON.stringify(value))
}

async function assembleReviewContent(
    studyJobId: string,
): Promise<{ content: ReviewContent; agentContext: string } | null> {
    const job = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .select([
            'studyJob.id as studyJobId',
            'study.orgId',
            'study.language',
            'study.projectSummary',
            'study.researchQuestions',
            'study.impact',
            'study.additionalNotes',
        ])
        .where('studyJob.id', '=', studyJobId)
        .executeTakeFirst()

    if (!job) {
        logger.warn(`Study job not found for review`, { studyJobId })
        return null
    }

    const proposalParts = [
        lexicalFieldToText(job.projectSummary),
        lexicalFieldToText(job.researchQuestions),
        lexicalFieldToText(job.impact),
        lexicalFieldToText(job.additionalNotes),
    ].filter((part) => part.trim().length > 0)

    const codeFiles = await fetchCodeFiles(studyJobId)
    if (Object.keys(codeFiles).length === 0) {
        logger.warn(`No code files found for study review`, { studyJobId })
        return null
    }

    const dataDocs = await generateDataSourcesContextString(job.orgId)

    const agentContext = await getAgentContextString(db, { language: job.language, orgId: null })

    const content: ReviewContent = {
        proposal: proposalParts.join('\n\n') || PLACEHOLDER,
        codeFiles,
        referenceDocs: {
            // TODO: wire up org-level compliance requirements doc (schema TBD).
            requirements: PLACEHOLDER,
            // TODO: wire up BRC (Base Research Container) docs.
            brcDocs: PLACEHOLDER,
            dataDocs,
            // TODO: wire up "other" docs bucket (free-form org reference material).
            otherDocs: PLACEHOLDER,
        },
        // TODO: pass researcherTestResults once test-run output is captured per studyJob.
    }

    return { content, agentContext }
}

export async function generateAndStoreStudyReview(studyJobId: string, round: number): Promise<void> {
    logger.info(`Generating study review`, { studyJobId, round })

    // Generation takes minutes, so the code it was started for can already have been replaced.
    // Checked again before each write, since the resubmit can also land mid-run (OTTER-779).
    if (!(await isCurrentCodeRound(studyJobId, round))) {
        logger.info(`Study review round is no longer current, skipping`, { studyJobId, round })
        return
    }

    const existing = await db
        .selectFrom('studyReview')
        .select(['id', 'summaryFailedAt'])
        .where('studyJobId', '=', studyJobId)
        .where('round', '=', round)
        .executeTakeFirst()
    // A prior failure row for this round is not terminal; only a successful row short-circuits.
    if (existing && existing.summaryFailedAt == null) {
        logger.info(`Study review already exists, skipping`, { studyJobId, round })
        return
    }

    try {
        await runStudyReview(studyJobId, round)
    } catch (error) {
        // Lets the reviewer-side poll tell "failed" from "still generating"; re-thrown so the
        // deferred wrapper still flushes to Sentry.
        await persistFailure(studyJobId, round)
        throw error
    }
}

async function runStudyReview(studyJobId: string, round: number): Promise<void> {
    const apiKey = await getConfigValue('CLAUDE_API_KEY', false)
    if (!apiKey) {
        logger.warn('CLAUDE_API_KEY not configured, writing disabled-review placeholder', { studyJobId })
        await persistReport(studyJobId, round, DISABLED_REPORT)
        return
    }

    const assembled = await assembleReviewContent(studyJobId)
    if (!assembled) return
    const { content, agentContext } = assembled

    // TODO(chat): persist `messages` alongside `report` once chat follow-up lands.
    const { report } = await generateAnalysis({ apiKey, additionalContext: agentContext }, content)

    await persistReport(studyJobId, round, report)
    logger.info(`Study review generated and stored`, { studyJobId, round })
}

// A run that outlived its round describes code nobody is reviewing any more, so its result is
// dropped rather than stored (OTTER-779).
async function roundWasSuperseded(studyJobId: string, round: number): Promise<boolean> {
    if (await isCurrentCodeRound(studyJobId, round)) return false
    logger.warn(`Discarding a study review for a superseded round`, { studyJobId, round })
    return true
}

async function persistReport(studyJobId: string, round: number, report: AnalysisReport): Promise<void> {
    if (await roundWasSuperseded(studyJobId, round)) return

    // A retry may have left a cleared failure row; overwrite it with the result.
    await db
        .insertInto('studyReview')
        .values({ studyJobId, round, report: JSON.stringify(report), summaryFailedAt: null })
        .onConflict((oc) =>
            oc.columns(['studyJobId', 'round']).doUpdateSet({ report: JSON.stringify(report), summaryFailedAt: null }),
        )
        .execute()
}

async function persistFailure(studyJobId: string, round: number): Promise<void> {
    if (await roundWasSuperseded(studyJobId, round)) return

    await db
        .insertInto('studyReview')
        .values({ studyJobId, round, report: null, summaryFailedAt: new Date() })
        .onConflict((oc) =>
            oc
                .columns(['studyJobId', 'round'])
                .doUpdateSet({ report: null, summaryFailedAt: new Date() })
                // Two runs of one round can overlap, and the failing one may be the older. A report
                // the reviewer is already reading is never replaced by a failure.
                .where('studyReview.summaryFailedAt', 'is not', null),
        )
        .execute()
}
