import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest'
import { db, insertTestStudyJobData } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import type { StudyJobStatus } from '@/database/types'
import { generateAndStoreStudyReview, PLACEHOLDER } from './runner'
import { generateAnalysis } from './agent'
import { fetchFileContents } from '@/server/storage'
import { getConfigValue } from '@/server/config'
import type { AnalysisReport, ReviewContent } from './types'
import { generateDataSourcesContextString } from '@/server/utils'

vi.mock('./agent', () => ({
    generateAnalysis: vi.fn(),
}))

vi.mock('@/server/storage', () => ({
    fetchFileContents: vi.fn(),
}))

vi.mock('@/server/config', () => ({
    getConfigValue: vi.fn(),
}))

vi.mock('@/server/utils', () => ({
    generateDataSourcesContextString: vi.fn(),
}))

const generateAnalysisMock = generateAnalysis as unknown as Mock
const fetchFileContentsMock = fetchFileContents as unknown as Mock
const getConfigValueMock = getConfigValue as unknown as Mock
const generateDataSourcesContextStringMock = generateDataSourcesContextString as unknown as Mock

const stubReport: AnalysisReport = {
    proposalSummary: 'summary',
    codeExplanation: 'explanation',
    alignmentCheck: { isAligned: true, findings: [] },
    complianceCheck: { isCompliant: true, findings: [] },
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

const addStatus = (studyJobId: string, status: StudyJobStatus, createdAt: Date) =>
    db.insertInto('jobStatusChange').values({ studyJobId, status, createdAt }).execute()

const insertMainCode = (studyJobId: string) =>
    db
        .insertInto('studyJobFile')
        .values({ studyJobId, name: 'main.r', path: 'studies/main.r', fileType: 'MAIN-CODE' })
        .execute()

type TestJobOptions = Parameters<typeof insertTestStudyJobData>[0]

const setupJob = async (options?: TestJobOptions) => (await insertTestStudyJobData(options)).job

const setupJobWithCode = async (options?: TestJobOptions) => {
    const job = await setupJob(options)
    await insertMainCode(job.id)
    return job
}

// Submitted, changes requested, submitted again: the job now carries round 2's code.
const resubmit = async (studyJobId: string) => {
    await addStatus(studyJobId, 'CODE-CHANGES-REQUESTED', minutesAgo(20))
    await addStatus(studyJobId, 'CODE-SUBMITTED', minutesAgo(10))
}

const storedReviews = (studyJobId: string) =>
    db
        .selectFrom('studyReview')
        .select((eb) => ['round', 'summaryFailedAt', eb.ref('report').$castTo<AnalysisReport | null>().as('report')])
        .where('studyJobId', '=', studyJobId)
        .orderBy('round')
        .execute()

describe('generateAndStoreStudyReview', () => {
    beforeEach(async () => {
        generateAnalysisMock.mockResolvedValue({ report: stubReport, messages: [] })
        getConfigValueMock.mockResolvedValue('test-api-key')
        fetchFileContentsMock.mockResolvedValue(new Blob(['print("hi")']))
        generateDataSourcesContextStringMock.mockResolvedValue('Data sources context')
        await db.deleteFrom('agentContext').execute()
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    it('assembles proposal, code files, and data docs and persists the report', async () => {
        const job = await setupJobWithCode({
            projectSummary: lexicalJson('Project summary text'),
            researchQuestions: lexicalJson('Research questions text'),
            impact: lexicalJson('Impact text'),
            additionalNotes: lexicalJson('Notes text'),
        })

        await generateAndStoreStudyReview(job.id, 1)

        expect(generateAnalysisMock).toHaveBeenCalledOnce()
        expect(generateDataSourcesContextStringMock).toHaveBeenCalledOnce()
        const [config, content] = generateAnalysisMock.mock.calls[0] as [{ apiKey: string }, ReviewContent]
        expect(config.apiKey).toBe('test-api-key')

        expect(content.proposal).toContain('Project summary text')
        expect(content.proposal).toContain('Research questions text')
        expect(content.proposal).toContain('Impact text')
        expect(content.proposal).toContain('Notes text')

        expect(content.codeFiles).toEqual({ 'main.r': 'print("hi")' })
        expect(fetchFileContentsMock).toHaveBeenCalledWith('studies/main.r')

        expect(content.referenceDocs.dataDocs).toBe('Data sources context')

        expect(content.referenceDocs.requirements).toBe(PLACEHOLDER)
        expect(content.referenceDocs.brcDocs).toBe(PLACEHOLDER)
        expect(content.referenceDocs.otherDocs).toBe(PLACEHOLDER)

        const stored = await storedReviews(job.id)
        expect(stored).toHaveLength(1)
        expect(stored[0].round).toBe(1)
    })

    it('passes the admin-authored SYSTEM + language context as additionalContext', async () => {
        const job = await setupJobWithCode({ language: 'R' })
        await db
            .insertInto('agentContext')
            .values([
                { name: 'SYSTEM', orgId: null, content: 'How SafeInsights works' },
                { name: 'R', orgId: null, content: 'R language guidance' },
            ])
            .execute()

        await generateAndStoreStudyReview(job.id, 1)

        const [config] = generateAnalysisMock.mock.calls[0] as [{ additionalContext: string }]
        expect(config.additionalContext).toContain('How SafeInsights works')
        expect(config.additionalContext).toContain('R language guidance')
    })

    it('skips when a study review already exists for the round', async () => {
        const job = await setupJob()
        await db
            .insertInto('studyReview')
            .values({ studyJobId: job.id, report: JSON.stringify(stubReport) })
            .execute()

        await generateAndStoreStudyReview(job.id, 1)

        expect(generateAnalysisMock).not.toHaveBeenCalled()
    })

    // The previous round's summary used to be deleted to make room for this one, which is what
    // made a late write from that round indistinguishable from the current one (OTTER-779).
    it('generates for a new round even though the previous round already has a summary', async () => {
        const job = await setupJobWithCode()
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(30))
        await db
            .insertInto('studyReview')
            .values({ studyJobId: job.id, round: 1, report: JSON.stringify(stubReport) })
            .execute()
        await resubmit(job.id)

        generateAnalysisMock.mockResolvedValue({
            report: { ...stubReport, codeExplanation: 'the resubmitted code' },
            messages: [],
        })

        await generateAndStoreStudyReview(job.id, 2)

        expect(generateAnalysisMock).toHaveBeenCalledOnce()
        const stored = await storedReviews(job.id)
        expect(stored.map((row) => row.round)).toEqual([1, 2])
        expect(stored[0].report?.codeExplanation).toBe('explanation')
        expect(stored[1].report?.codeExplanation).toBe('the resubmitted code')
    })

    it('does not run generation for a round that is already superseded', async () => {
        const job = await setupJobWithCode()
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(30))
        await resubmit(job.id)

        await generateAndStoreStudyReview(job.id, 1)

        expect(generateAnalysisMock).not.toHaveBeenCalled()
        expect(await storedReviews(job.id)).toEqual([])
    })

    // The race the card reports: the run was current when it started and analyzed the old code.
    it('discards a report when the resubmit lands mid-run', async () => {
        const job = await setupJobWithCode()
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(30))

        generateAnalysisMock.mockImplementationOnce(async () => {
            await resubmit(job.id)
            return { report: stubReport, messages: [] }
        })

        await generateAndStoreStudyReview(job.id, 1)

        const stored = await storedReviews(job.id)
        expect(stored.map((row) => row.round)).toEqual([1])
        expect(stored[0].report).toBeNull()
        expect(stored[0].summaryFailedAt).toBeNull()
    })

    // The inverted order, which the card calls the worse one: a stale failure used to overwrite a
    // good report and show as a permanent error on code that was analyzed successfully.
    it('keeps the current round intact when a superseded run fails', async () => {
        const job = await setupJobWithCode()
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(30))

        generateAnalysisMock.mockImplementationOnce(async () => {
            await resubmit(job.id)
            await db
                .insertInto('studyReview')
                .values({ studyJobId: job.id, round: 2, report: JSON.stringify(stubReport) })
                .execute()
            throw new Error('model exploded')
        })

        await expect(generateAndStoreStudyReview(job.id, 1)).rejects.toThrow('model exploded')

        // Round 1 keeps the claim of the run that produced nothing; only round 2 reaches a reviewer.
        const stored = await storedReviews(job.id)
        expect(stored.map((row) => row.round)).toEqual([1, 2])
        expect(stored[0].report).toBeNull()
        expect(stored[1].summaryFailedAt).toBeNull()
        expect(stored[1].report).not.toBeNull()
    })

    // Two runs of ONE round used to both proceed and race for the row. Retry is the common way in.
    it('refuses a second run while one for the same round is still alive', async () => {
        const job = await setupJobWithCode()
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(30))

        let finishFirstRun = (_result: unknown) => {}
        generateAnalysisMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishFirstRun = resolve
                }),
        )

        const firstRun = generateAndStoreStudyReview(job.id, 1)
        await vi.waitFor(() => expect(generateAnalysisMock).toHaveBeenCalledTimes(1))

        await generateAndStoreStudyReview(job.id, 1)
        expect(generateAnalysisMock).toHaveBeenCalledTimes(1)

        finishFirstRun({ report: stubReport, messages: [] })
        await firstRun

        const stored = await storedReviews(job.id)
        expect(stored).toHaveLength(1)
        expect(stored[0].report).not.toBeNull()
    })

    // The claim is not a lock on the write, so a report can still land while a run is failing.
    it('does not let a late failure replace a report from the same round', async () => {
        const job = await setupJobWithCode()
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(30))

        generateAnalysisMock.mockImplementationOnce(async () => {
            await db
                .updateTable('studyReview')
                .set({ report: JSON.stringify(stubReport) })
                .where('studyJobId', '=', job.id)
                .where('round', '=', 1)
                .execute()
            throw new Error('model exploded')
        })

        await expect(generateAndStoreStudyReview(job.id, 1)).rejects.toThrow('model exploded')

        const stored = await storedReviews(job.id)
        expect(stored).toHaveLength(1)
        expect(stored[0].summaryFailedAt).toBeNull()
        expect(stored[0].report).not.toBeNull()
    })

    it('records a failure, and does not call the agent, when no code files are attached to the job', async () => {
        const job = await setupJob()

        await generateAndStoreStudyReview(job.id, 1)

        expect(generateAnalysisMock).not.toHaveBeenCalled()
        const stored = await storedReviews(job.id)
        expect(stored).toHaveLength(1)
        expect(stored[0].summaryFailedAt).toBeInstanceOf(Date)
    })

    it('persists a failure row and re-throws when generation throws', async () => {
        const boom = new Error('model exploded')
        generateAnalysisMock.mockRejectedValue(boom)
        const job = await setupJobWithCode()

        await expect(generateAndStoreStudyReview(job.id, 1)).rejects.toThrow('model exploded')

        const stored = await db
            .selectFrom('studyReview')
            .select(['report', 'round', 'summaryFailedAt'])
            .where('studyJobId', '=', job.id)
            .executeTakeFirst()
        expect(stored?.report).toBeNull()
        expect(stored?.round).toBe(1)
        expect(stored?.summaryFailedAt).toBeInstanceOf(Date)
    })

    it('claims the round with a pending row before the model call starts', async () => {
        const job = await setupJobWithCode()

        let claimed: { report: unknown; summaryStartedAt: Date | null } | undefined
        generateAnalysisMock.mockImplementationOnce(async () => {
            claimed = await db
                .selectFrom('studyReview')
                .select(['report', 'summaryStartedAt'])
                .where('studyJobId', '=', job.id)
                .where('round', '=', 1)
                .executeTakeFirst()
            return { report: stubReport, messages: [] }
        })

        await generateAndStoreStudyReview(job.id, 1)

        expect(claimed?.report).toBeNull()
        expect(claimed?.summaryStartedAt).toBeInstanceOf(Date)
    })

    it('takes over a pending row old enough to be a run that died', async () => {
        const job = await setupJobWithCode()
        await db
            .insertInto('studyReview')
            .values({ studyJobId: job.id, round: 1, report: null, summaryStartedAt: minutesAgo(15) })
            .execute()

        await generateAndStoreStudyReview(job.id, 1)

        expect(generateAnalysisMock).toHaveBeenCalledOnce()
        const stored = await storedReviews(job.id)
        expect(stored).toHaveLength(1)
        expect(stored[0].report).not.toBeNull()
    })

    it('gives the model call a deadline, so a stalled run reports rather than hangs', async () => {
        const job = await setupJobWithCode()

        await generateAndStoreStudyReview(job.id, 1)

        const [config] = generateAnalysisMock.mock.calls[0] as [{ signal?: AbortSignal }]
        expect(config.signal).toBeInstanceOf(AbortSignal)
    })

    // The whole point of the claim: an older run that comes back after a takeover no longer owns the
    // row, so it can neither publish its stale report nor fail the run that replaced it (OTTER-799).
    it('does not let a superseded run fail the claim that took over from it', async () => {
        const job = await setupJobWithCode()

        generateAnalysisMock.mockImplementationOnce(async () => {
            // Stands in for the retry that gave the round to a fresh run while this one was hung.
            await db
                .updateTable('studyReview')
                .set({ summaryStartedAt: new Date() })
                .where('studyJobId', '=', job.id)
                .where('round', '=', 1)
                .execute()
            throw new Error('model exploded')
        })

        await expect(generateAndStoreStudyReview(job.id, 1)).rejects.toThrow('model exploded')

        const stored = await storedReviews(job.id)
        expect(stored).toHaveLength(1)
        expect(stored[0].summaryFailedAt).toBeNull()
        expect(stored[0].report).toBeNull()
    })

    it('does not let a superseded run publish its report over the claim that replaced it', async () => {
        const job = await setupJobWithCode()

        generateAnalysisMock.mockImplementationOnce(async () => {
            await db
                .updateTable('studyReview')
                .set({ summaryStartedAt: new Date() })
                .where('studyJobId', '=', job.id)
                .where('round', '=', 1)
                .execute()
            return { report: stubReport, messages: [] }
        })

        await generateAndStoreStudyReview(job.id, 1)

        const stored = await storedReviews(job.id)
        expect(stored).toHaveLength(1)
        expect(stored[0].report).toBeNull()
    })

    it('re-runs generation when only a failed row exists (retry path)', async () => {
        const job = await setupJobWithCode()
        await db
            .insertInto('studyReview')
            .values({ studyJobId: job.id, report: null, summaryFailedAt: new Date() })
            .execute()

        await generateAndStoreStudyReview(job.id, 1)

        expect(generateAnalysisMock).toHaveBeenCalledOnce()
        const stored = await db
            .selectFrom('studyReview')
            .select(['report', 'summaryFailedAt'])
            .where('studyJobId', '=', job.id)
            .executeTakeFirst()
        expect(stored?.report).not.toBeNull()
        expect(stored?.summaryFailedAt).toBeNull()
    })

    it('writes the disabled-review placeholder and skips the agent when CLAUDE_API_KEY is unset', async () => {
        getConfigValueMock.mockResolvedValue(undefined)
        const job = await setupJob()

        await generateAndStoreStudyReview(job.id, 1)

        expect(generateAnalysisMock).not.toHaveBeenCalled()

        const stored = await db
            .selectFrom('studyReview')
            .select((eb) => eb.ref('report').$castTo<AnalysisReport>().as('report'))
            .where('studyJobId', '=', job.id)
            .executeTakeFirst()
        expect(stored).toBeDefined()
        const report = stored!.report
        expect(report.proposalSummary).toMatch(/did not run|disabled/i)
        expect(report.alignmentCheck.isAligned).toBe(false)
        expect(report.complianceCheck.isCompliant).toBe(false)
        expect(report.alignmentCheck.findings.length).toBeGreaterThan(0)
        expect(report.complianceCheck.findings.length).toBeGreaterThan(0)
    })
})
