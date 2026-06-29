import { db } from '@/database'
import logger from '@/lib/logger'
import { extractTextFromLexical } from '@/lib/lexical'
import { generateAnalysis } from './agent'
import type { AnalysisReport, ReviewContent } from './types'
import { getConfigValue } from '@/server/config'
import { fetchFileContents } from '@/server/storage'
import { generateDataSourcesContextString } from '@/server/utils'

// Written when the API key is missing, before content assembly. This means a
// no-code-files study with a missing key gets the placeholder too — fine, since
// either condition prevents a real review. Sentinel is "automated review didn't
// run," not strictly "key missing." Booleans are intentionally `false` so the
// UI renders red Misaligned / Non-compliant badges — a missing review must NOT
// look like a passing review to a reviewer.
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

async function assembleReviewContent(studyJobId: string): Promise<ReviewContent | null> {
    const job = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .select([
            'studyJob.id as studyJobId',
            'study.orgId',
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

    return {
        proposal: proposalParts.join('\n\n') || PLACEHOLDER,
        codeFiles,
        referenceDocs: {
            // TODO: wire up org-level compliance requirements doc (schema TBD).
            // Drives compliance check findings — currently agent has nothing to compare against.
            requirements: PLACEHOLDER,
            // TODO: wire up BRC (Base Research Container) docs — describes the technical
            // environment / available libraries / data layout for the analysis code.
            brcDocs: PLACEHOLDER,
            dataDocs,
            // TODO: wire up "other" docs bucket (free-form org reference material).
            otherDocs: PLACEHOLDER,
        },
        // TODO: pass researcherTestResults once test-run output is captured per studyJob
        // (StudyJobFile fileType for results / RUN logs). Enables `resultsSummary` field.
    }
}

export async function generateAndStoreStudyReview(studyJobId: string): Promise<void> {
    logger.info(`Generating study review`, { studyJobId })

    const existing = await db
        .selectFrom('studyReview')
        .select(['id', 'summaryFailedAt'])
        .where('studyJobId', '=', studyJobId)
        .executeTakeFirst()
    // A prior failure row is not terminal: a retry clears it and re-enters here.
    // Only a successful (or placeholder) row short-circuits.
    if (existing && existing.summaryFailedAt == null) {
        logger.info(`Study review already exists, skipping`, { studyJobId })
        return
    }

    try {
        await runStudyReview(studyJobId)
    } catch (error) {
        // Record the failure so the reviewer-side poll can tell "failed" from
        // "still generating" and surface a retry. Re-throw so the deferred
        // wrapper still captures + flushes to Sentry.
        await persistFailure(studyJobId)
        throw error
    }
}

async function runStudyReview(studyJobId: string): Promise<void> {
    const apiKey = await getConfigValue('CLAUDE_API_KEY', false)
    if (!apiKey) {
        logger.warn('CLAUDE_API_KEY not configured — writing disabled-review placeholder', { studyJobId })
        await persistReport(studyJobId, DISABLED_REPORT)
        return
    }

    const content = await assembleReviewContent(studyJobId)
    if (!content) return

    // TODO(SI-Admin): once the SI Admin org-level config schema lands, fetch
    // `systemPrompt` and `analysisPromptTemplate` overrides for `job.orgId`
    // and pass them through. Agent already honors them — only the lookup is
    // missing. Until then, both fall back to the bundled defaults.
    // TODO(chat): persist `messages` alongside `report` (e.g. add a
    // `conversation jsonb` column on studyReview) once chat follow-up lands
    // (target: before Oct 2026). Seed for `continueChat`.
    const { report } = await generateAnalysis({ apiKey }, content)

    await persistReport(studyJobId, report)
    logger.info(`Study review generated and stored`, { studyJobId })
}

async function persistReport(studyJobId: string, report: AnalysisReport): Promise<void> {
    // A retry may have left a cleared failure row; overwrite it with the result.
    await db
        .insertInto('studyReview')
        .values({ studyJobId, report: JSON.stringify(report), summaryFailedAt: null })
        .onConflict((oc) =>
            oc.column('studyJobId').doUpdateSet({ report: JSON.stringify(report), summaryFailedAt: null }),
        )
        .execute()
}

async function persistFailure(studyJobId: string): Promise<void> {
    await db
        .insertInto('studyReview')
        .values({ studyJobId, report: null, summaryFailedAt: new Date() })
        .onConflict((oc) => oc.column('studyJobId').doUpdateSet({ report: null, summaryFailedAt: new Date() }))
        .execute()
}
