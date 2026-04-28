import { db } from '@/database'
import logger from '@/lib/logger'
import { extractTextFromLexical } from '@/lib/word-count'
import { ReviewAgent } from '@/server/review-agent'
import type { AnalysisReport, ReviewContent } from '@/server/review-agent'
import { getConfigValue } from '@/server/config'
import { fetchFileContents } from '@/server/storage'

const MAX_FILE_SIZE_BYTES = 100_000

const PLACEHOLDER = '(none provided)'

async function fetchCodeFiles(studyJobId: string): Promise<Record<string, string>> {
    const files = await db
        .selectFrom('studyJobFile')
        .select(['name', 'path'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', 'in', ['MAIN-CODE', 'SUPPLEMENTAL-CODE'])
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

async function fetchDataDocs(orgId: string): Promise<string> {
    const sources = await db
        .selectFrom('orgDataSource')
        .select(['name', 'description', 'documentationUrl'])
        .where('orgId', '=', orgId)
        .execute()

    const sections: string[] = []
    for (const source of sources) {
        const lines: string[] = [`### ${source.name}`]
        if (source.description) lines.push(source.description)
        if (source.documentationUrl) lines.push(`Documentation: ${source.documentationUrl}`)
        sections.push(lines.join('\n'))
    }
    return sections.length > 0 ? sections.join('\n\n') : PLACEHOLDER
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

    const dataDocs = await fetchDataDocs(job.orgId)

    return {
        proposal: proposalParts.join('\n\n') || PLACEHOLDER,
        codeFiles,
        referenceDocs: {
            requirements: PLACEHOLDER,
            brcDocs: PLACEHOLDER,
            dataDocs,
            otherDocs: PLACEHOLDER,
        },
    }
}

export async function generateAndStoreStudyReview(studyJobId: string): Promise<void> {
    logger.info(`Generating study review`, { studyJobId })

    const content = await assembleReviewContent(studyJobId)
    if (!content) return

    const apiKey = await getConfigValue('CLAUDE_API_KEY')
    const agent = new ReviewAgent({ apiKey })
    agent.loadContent(content)
    const report: AnalysisReport = await agent.generateAnalysis()

    await db
        .insertInto('studyReview')
        .values({
            studyJobId,
            generatedAt: new Date(),
            report: JSON.stringify(report),
        })
        .execute()

    logger.info(`Study review generated and stored`, { studyJobId })
}
