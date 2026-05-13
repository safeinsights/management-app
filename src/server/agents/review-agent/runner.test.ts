import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest'
import { db, insertTestDataSource, insertTestOrg, insertTestStudyJobData } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/word-count'
import { generateAndStoreStudyReview, PLACEHOLDER } from './runner'
import { generateAnalysis } from './agent'
import { fetchFileContents } from '@/server/storage'
import { getConfigValue } from '@/server/config'
import type { AnalysisReport, ReviewContent } from './types'

vi.mock('./agent', () => ({
    generateAnalysis: vi.fn(),
}))

vi.mock('@/server/storage', () => ({
    fetchFileContents: vi.fn(),
}))

vi.mock('@/server/config', () => ({
    getConfigValue: vi.fn(),
}))

const generateAnalysisMock = generateAnalysis as unknown as Mock
const fetchFileContentsMock = fetchFileContents as unknown as Mock
const getConfigValueMock = getConfigValue as unknown as Mock

const stubReport: AnalysisReport = {
    proposalSummary: 'summary',
    codeExplanation: 'explanation',
    alignmentCheck: { isAligned: true, findings: [] },
    complianceCheck: { isCompliant: true, findings: [] },
}

describe('generateAndStoreStudyReview', () => {
    beforeEach(() => {
        generateAnalysisMock.mockResolvedValue({ report: stubReport, messages: [] })
        getConfigValueMock.mockResolvedValue('test-api-key')
        fetchFileContentsMock.mockResolvedValue(new Blob(['print("hi")']))
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    it('assembles proposal, code files, and data docs and persists the report', async () => {
        const org = await insertTestOrg()
        const { job } = await insertTestStudyJobData({
            org,
            projectSummary: lexicalJson('Project summary text'),
            researchQuestions: lexicalJson('Research questions text'),
            impact: lexicalJson('Impact text'),
            additionalNotes: lexicalJson('Notes text'),
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'main.r',
                path: 'studies/main.r',
                fileType: 'MAIN-CODE',
            })
            .execute()

        await insertTestDataSource({
            orgId: org.id,
            name: 'Patients DB',
            description: 'Patient records',
            urls: [
                { url: 'https://docs.example.com/patients', description: 'Schema reference' },
                { url: 'https://docs.example.com/codes', description: 'ICD codes' },
            ],
        })

        await generateAndStoreStudyReview(job.id)

        expect(generateAnalysisMock).toHaveBeenCalledOnce()
        const [config, content] = generateAnalysisMock.mock.calls[0] as [{ apiKey: string }, ReviewContent]
        expect(config.apiKey).toBe('test-api-key')

        expect(content.proposal).toContain('Project summary text')
        expect(content.proposal).toContain('Research questions text')
        expect(content.proposal).toContain('Impact text')
        expect(content.proposal).toContain('Notes text')

        expect(content.codeFiles).toEqual({ 'main.r': 'print("hi")' })
        expect(fetchFileContentsMock).toHaveBeenCalledWith('studies/main.r')

        expect(content.referenceDocs.dataDocs).toBe(
            [
                '### Patients DB',
                'Patient records',
                'Documentation: https://docs.example.com/patients (Schema reference)',
                'Documentation: https://docs.example.com/codes (ICD codes)',
            ].join('\n'),
        )

        expect(content.referenceDocs.requirements).toBe(PLACEHOLDER)
        expect(content.referenceDocs.brcDocs).toBe(PLACEHOLDER)
        expect(content.referenceDocs.otherDocs).toBe(PLACEHOLDER)

        const stored = await db
            .selectFrom('studyReview')
            .select('studyJobId')
            .where('studyJobId', '=', job.id)
            .executeTakeFirst()
        expect(stored?.studyJobId).toBe(job.id)
    })

    it('handles null field in data doc URLs in an expected manner', async () => {
        const org = await insertTestOrg()
        const { job } = await insertTestStudyJobData({ org })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'main.r',
                path: 'studies/main.r',
                fileType: 'MAIN-CODE',
            })
            .execute()

        await insertTestDataSource({
            orgId: org.id,
            name: 'Patients DB',
            description: 'Patient records',
            urls: [
                { url: 'https://docs.example.com/patients', description: null },
                { url: null, description: null },
            ],
        })

        await generateAndStoreStudyReview(job.id)

        expect(generateAnalysisMock).toHaveBeenCalledOnce()
        const [, content] = generateAnalysisMock.mock.calls[0] as [unknown, ReviewContent]

        expect(content.referenceDocs.dataDocs).toBe(
            [
                '### Patients DB',
                'Patient records',
                'Documentation: https://docs.example.com/patients (No description provided)',
            ].join('\n'),
        )
    })

    it('falls back to a placeholder when the org has no data sources', async () => {
        const org = await insertTestOrg()
        const { job } = await insertTestStudyJobData({ org })
        await db
            .insertInto('studyJobFile')
            .values({ studyJobId: job.id, name: 'main.r', path: 'studies/main.r', fileType: 'MAIN-CODE' })
            .execute()

        await generateAndStoreStudyReview(job.id)

        const [, content] = generateAnalysisMock.mock.calls[0] as [unknown, ReviewContent]
        expect(content.referenceDocs.dataDocs).toBe('(none provided)')
    })

    it('skips when a study review already exists for the job', async () => {
        const org = await insertTestOrg()
        const { job } = await insertTestStudyJobData({ org })
        await db
            .insertInto('studyReview')
            .values({ studyJobId: job.id, report: JSON.stringify(stubReport) })
            .execute()

        await generateAndStoreStudyReview(job.id)

        expect(generateAnalysisMock).not.toHaveBeenCalled()
    })

    it('does not call the agent when no code files are attached to the job', async () => {
        const org = await insertTestOrg()
        const { job } = await insertTestStudyJobData({ org })

        await generateAndStoreStudyReview(job.id)

        expect(generateAnalysisMock).not.toHaveBeenCalled()
    })

    it('writes the disabled-review placeholder and skips the agent when CLAUDE_API_KEY is unset', async () => {
        getConfigValueMock.mockResolvedValue(undefined)
        const org = await insertTestOrg()
        const { job } = await insertTestStudyJobData({ org })

        await generateAndStoreStudyReview(job.id)

        expect(generateAnalysisMock).not.toHaveBeenCalled()

        const stored = await db
            .selectFrom('studyReview')
            .select((eb) => eb.ref('report').$castTo<AnalysisReport>().as('report'))
            .where('studyJobId', '=', job.id)
            .executeTakeFirst()
        expect(stored).toBeDefined()
        const report = stored!.report
        expect(report.proposalSummary).toMatch(/disabled/i)
        expect(report.alignmentCheck.findings).toEqual([])
        expect(report.complianceCheck.findings).toEqual([])
    })
})
