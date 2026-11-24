import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import type { StudyJobStatus } from '@/database/types'
import {
    actionResult,
    advanceTimers,
    createTestQueryClient,
    db,
    fakeTimeouts,
    insertTestDataSource,
    insertTestJobStatus,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    restoreRealTimers,
    screen,
    userEvent,
    type Mock,
    waitFor,
    waitForPendingQueries,
    within,
} from '@/tests/unit.helpers'
import { rem } from '@mantine/core'
import { useParams } from 'next/navigation'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type JobScanResult, jobAnalysisForJob, latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { SubmittedCodeSection } from './submitted-code-section'
import { latestCodeSubmittedAt } from '@/lib/study-job-status'
import { JobAnalysisPanels, splitPreviewBlocks } from './submitted-code-interactive'
import { fetchFileContents } from '@/server/storage'

vi.mock('@/server/storage', async () => {
    const actual = await vi.importActual<typeof import('@/server/storage')>('@/server/storage')
    return {
        ...actual,
        fetchFileContents: vi.fn(async () => new Blob(['print("hello from main.R")\n'])),
    }
})

const ORG_SLUG = 'test-org-submitted'

const SCAN_DETAILS = 'R and Python files analyzed: 1\n  main.r\n\nFor review, not failing the gate:\n  main.r:28  INFO'

const scanResult = (semgrep: JobScanResult['semgrep'], details: string | null = SCAN_DETAILS): JobScanResult => ({
    semgrep,
    details,
    logFile: { id: 'scan-log-id', name: 'security-scan-log.txt', path: 'studies/x/security-scan-log.txt' },
})

const scanInProgress: JobScanResult = { semgrep: null, details: null, logFile: null }

// happy-dom's ResizeObserver never calls back, so Mantine's overflow check would never run.
class ImmediateResizeObserver {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
        this.callback = callback
    }
    observe() {
        this.callback([], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
}

async function insertStudyJobFile(
    studyJobId: string,
    name: string,
    fileType: 'MAIN-CODE' | 'SUPPLEMENTAL-CODE' | 'ENCRYPTED-SECURITY-SCAN-LOG' | 'SECURITY-SCAN-LOG',
) {
    return db
        .insertInto('studyJobFile')
        .values({ studyJobId, name, path: `studies/${studyJobId}/${name}`, fileType })
        .returningAll()
        .executeTakeFirstOrThrow()
}

async function insertStudyReview(studyJobId: string, codeExplanation: string) {
    return db
        .insertInto('studyReview')
        .values({
            studyJobId,
            report: {
                proposalSummary: 'Proposal summary text',
                codeExplanation,
                alignmentCheck: { isAligned: true, findings: [] },
                complianceCheck: { isCompliant: true, findings: [] },
            },
        })
        .returningAll()
        .executeTakeFirstOrThrow()
}

async function insertPendingStudyReview(studyJobId: string, summaryStartedAt: Date) {
    return db
        .insertInto('studyReview')
        .values({ studyJobId, report: null, summaryFailedAt: null, summaryStartedAt })
        .returningAll()
        .executeTakeFirstOrThrow()
}

async function insertFailedStudyReview(studyJobId: string) {
    return db
        .insertInto('studyReview')
        .values({ studyJobId, report: null, summaryFailedAt: new Date() })
        .returningAll()
        .executeTakeFirstOrThrow()
}

// The verdict is parsed from the log's contents, which come from the storage mock.
async function insertScanLog(studyJobId: string, verdict: 'no findings' | 'findings found') {
    vi.mocked(fetchFileContents).mockResolvedValue(new Blob([`Semgrep scan: ${verdict}\n${SCAN_DETAILS}`]))
    return insertStudyJobFile(studyJobId, 'security-scan-log.txt', 'SECURITY-SCAN-LOG')
}

// The poll runs the real action, so it is counted on the query cache as each poll starts.
const watchPolls = (queryClient: ReturnType<typeof createTestQueryClient>) => {
    const polls = { started: 0, failed: 0 }
    queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.query.queryKey[0] !== 'job-analysis') return
        if (event.action.type === 'fetch') polls.started++
        if (event.action.type === 'error') polls.failed++
    })
    return polls
}

// A poll in flight absorbs the interval ticks, so it must land first. Counted across several
// intervals: a count compared to itself inside waitFor passes against a poll that never stops.
const expectPollingStopped = async (polls: ReturnType<typeof watchPolls>) => {
    const settled = polls.started
    await waitForPendingQueries()
    await advanceTimers(200)
    expect(polls.started).toBe(settled)
}

type Fixture = {
    orgId: string
    study: SelectedStudy
    job: LatestJobForStudy
}

async function setupBaseFixture(overrides: { datasets?: string[]; studyTitle?: string } = {}): Promise<Fixture> {
    const { org, user } = await mockSessionWithTestData({ orgSlug: ORG_SLUG, orgType: 'enclave' })
    const { study: dbStudy } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'APPROVED',
        jobStatus: 'CODE-SUBMITTED',
        title: overrides.studyTitle ?? 'A study with submitted code',
        datasets: overrides.datasets ?? null,
    })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const job = await latestJobForStudy(study.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: study.id })
    return { orgId: org.id, study, job }
}

async function refreshFixtureJob(fixture: Fixture): Promise<Fixture> {
    return { ...fixture, job: await latestJobForStudy(fixture.study.id) }
}

afterEach(restoreRealTimers)

async function renderSection(fixture: Fixture, scanOverride?: JobScanResult) {
    const analysis = await jobAnalysisForJob(fixture.job)
    return renderWithProviders(
        <SubmittedCodeSection
            orgSlug={ORG_SLUG}
            study={fixture.study}
            job={fixture.job}
            analysis={scanOverride ? { ...analysis, scan: scanOverride } : analysis}
        />,
    )
}

describe('SubmittedCodeSection — Section header', () => {
    let fixture: Fixture

    beforeEach(async () => {
        fixture = await setupBaseFixture()
    })

    it('renders section title "Submission details"', async () => {
        await renderSection(fixture)
        expect(screen.getByRole('heading', { name: 'Submission details', level: 3 })).toBeInTheDocument()
    })

    it('renders "View approved proposal" as an outlined button that opens the approved-proposal page in a new tab', async () => {
        await renderSection(fixture)
        const link = screen.getByTestId('view-approved-initial-request')
        expect(link).toHaveTextContent('View approved proposal')
        expect(link).toHaveAttribute('data-variant', 'outline')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
        // OTTER-540: must point at the approved initial request, not the code review.
        expect(link).toHaveAttribute('href', `/${ORG_SLUG}/study/${fixture.study.id}/review/proposal`)
    })

    it('renders the section content beneath the header', async () => {
        await renderSection(fixture)
        const section = screen.getByTestId('submitted-code-section')
        expect(section).toContainElement(screen.getByTestId('submitted-code-header'))
        expect(section).toContainElement(screen.getByTestId('submitted-code-datasets'))
    })
})

describe('SubmittedCodeSection — Dataset pills', () => {
    it('renders subtitle "Dataset(s) associated with the study"', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture)
        expect(screen.getByText('Dataset(s) associated with the study')).toBeInTheDocument()
    })

    it('renders datasets as non-interactive pills populated from the study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: ORG_SLUG, orgType: 'enclave' })
        const ds1 = await insertTestDataSource({ orgId: org.id, name: 'Classroom Engagement Metrics' })
        const ds2 = await insertTestDataSource({ orgId: org.id, name: 'Study Behavior Analytics Dataset' })

        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
            datasets: [ds1.id, ds2.id],
        })
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const job = await latestJobForStudy(study.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: study.id })
        await renderSection({ orgId: org.id, study, job })

        const pills = screen.getAllByTestId('submitted-code-dataset-pill')
        expect(pills).toHaveLength(2)
        expect(pills[0]).toHaveTextContent('Classroom Engagement Metrics')
        expect(pills[1]).toHaveTextContent('Study Behavior Analytics Dataset')

        for (const pill of pills) {
            expect(pill.querySelector('button')).toBeNull()
            expect(pill.querySelector('a')).toBeNull()
        }
    })

    it('renders an empty-state when no datasets are associated', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture)
        expect(screen.getByTestId('submitted-code-datasets-empty')).toHaveTextContent('No datasets associated')
    })
})

describe('SubmittedCodeSection — AI summary', () => {
    let fixture: Fixture
    const SUMMARY_TEXT = 'This script aggregates assessment scores grouped by treatment type.'

    beforeEach(async () => {
        fixture = await setupBaseFixture()
        await insertStudyReview(fixture.job.id, SUMMARY_TEXT)
    })

    it('renders section title "AI Summary of submitted code files" and the disclaimer', async () => {
        await renderSection(fixture)
        expect(screen.getByText('AI Summary of submitted code files')).toBeInTheDocument()
        expect(screen.getByText(/AI-generated summary, which may contain errors/)).toBeInTheDocument()
    })

    it("shows the summary's own Overview heading only once", async () => {
        const headedFixture = await setupBaseFixture()
        await insertStudyReview(headedFixture.job.id, `## Overview\n\n${SUMMARY_TEXT}`)
        await renderSection(headedFixture)
        expect(screen.getAllByText('Overview')).toHaveLength(1)
    })

    it('renders the toggle with "View full AI summary" by default and shows a clamped snippet', async () => {
        await renderSection(fixture)
        expect(screen.getByTestId('ai-summary-toggle')).toHaveTextContent('View full AI summary')
        const body = screen.getByTestId('ai-summary-body')
        expect(body).toHaveTextContent(SUMMARY_TEXT)
        expect(body.style.getPropertyValue('--text-line-clamp')).toBe('2')
    })

    it('expands the body to full text and flips the toggle label when clicked', async () => {
        await renderSection(fixture)
        const user = userEvent.setup()
        await user.click(screen.getByTestId('ai-summary-toggle'))

        const body = screen.getByTestId('ai-summary-body')
        expect(body).toHaveTextContent(SUMMARY_TEXT)
        expect(body.style.getPropertyValue('--text-line-clamp')).toBe('')
        expect(screen.getByTestId('ai-summary-toggle')).toHaveTextContent('Hide full AI summary')
    })

    it('collapses back to the clamped snippet when the toggle is clicked twice', async () => {
        await renderSection(fixture)
        const user = userEvent.setup()
        const toggle = screen.getByTestId('ai-summary-toggle')
        await user.click(toggle)
        await user.click(toggle)

        expect(screen.getByTestId('ai-summary-body').style.getPropertyValue('--text-line-clamp')).toBe('2')
        expect(toggle).toHaveTextContent('View full AI summary')
    })

    it('caps the expanded summary and scrolls it inside the box, with the toggle outside the scroll area', async () => {
        await renderSection(fixture)
        expect(screen.queryByTestId('ai-summary-scroll')).not.toBeInTheDocument()

        await userEvent.setup().click(screen.getByTestId('ai-summary-toggle'))

        const scroll = screen.getByTestId('ai-summary-scroll')
        expect(scroll.style.maxHeight).toBe(rem(616))
        expect(scroll).toContainElement(screen.getByTestId('ai-summary-body'))
        expect(scroll).not.toContainElement(screen.getByTestId('ai-summary-toggle'))
    })

    it.each([
        ['makes the scrolling viewport a tab stop when the summary overflows', 1000, '0'],
        ['adds no tab stop when the summary fits', 0, null],
    ])('%s', async (_label, scrollHeight, tabIndex) => {
        vi.stubGlobal('ResizeObserver', ImmediateResizeObserver)
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
        try {
            await renderSection(fixture)
            await userEvent.setup().click(screen.getByTestId('ai-summary-toggle'))

            const viewport = within(screen.getByTestId('ai-summary-scroll')).getByRole('region', {
                name: 'Full AI summary',
            })
            expect(viewport).toContainElement(screen.getByTestId('ai-summary-body'))
            await waitFor(() => expect(viewport.getAttribute('tabindex')).toBe(tabIndex))
        } finally {
            // mockReset does not undo a stubbed global, and the rest of the file expects happy-dom's observer.
            vi.unstubAllGlobals()
        }
    })

    it('renders Title Case summary headings in sentence case', async () => {
        const headedFixture = await setupBaseFixture()
        await insertStudyReview(
            headedFixture.job.id,
            [
                '## **File Overview**\n\nThe Code Uses R.',
                '**Data Flow Issues**\n\nText.',
                '#### Main Data Processing (Main.R)\n\nMore.',
                '## 1. Data Loading And Cleaning\n\nSteps.',
                '### Reading Data from the Student File\n\nRows.',
                '### Reading Data From Google Sheets\n\nSheets.',
                '### *Variables Used* In The Script\n\nNames.',
                '### Querying Mars University Data\n\nRows.',
            ].join('\n\n'),
        )
        await renderSection(headedFixture)
        await userEvent.setup().click(screen.getByTestId('ai-summary-toggle'))

        expect(screen.getByRole('heading', { name: 'File overview' })).toBeInTheDocument()
        expect(screen.getByText('Data flow issues')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Main data processing (Main.R)' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: '1. Data loading and cleaning' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Reading data from the student file' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Reading data from Google sheets' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Variables used in the script' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Querying Mars University data' })).toBeInTheDocument()
        expect(screen.getByText('The Code Uses R.')).toBeInTheDocument()
    })

    it('leaves sentence-case headings and the skipped-files note as written', async () => {
        const headedFixture = await setupBaseFixture()
        await insertStudyReview(
            headedFixture.job.id,
            '**This summary does not cover 2 submitted files:**\n\n- `a.R`: too big\n\n## Reading data with Python\n\nText.\n\n## Run in Python\n\nMore.',
        )
        await renderSection(headedFixture)
        await userEvent.setup().click(screen.getByTestId('ai-summary-toggle'))

        expect(screen.getByText('This summary does not cover 2 submitted files:')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Reading data with Python' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Run in Python' })).toBeInTheDocument()
    })

    it('shows the in-progress spinner while no review row exists yet (still generating)', async () => {
        const noReviewFixture = await setupBaseFixture()
        await renderSection(noReviewFixture)
        const pending = await screen.findByTestId('ai-summary-pending')
        expect(pending).toHaveTextContent('Generating summary')
        expect(within(pending).getAllByTestId('ai-summary-skeleton-line')).toHaveLength(2)
        expect(within(pending).getByRole('status')).toHaveTextContent('Generating summary')
        expect(screen.queryByTestId('ai-summary-toggle')).not.toBeInTheDocument()
        expect(screen.queryByTestId('ai-summary-empty')).not.toBeInTheDocument()
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
    })

    it('keeps loading for a complex resubmission on a reused job', async () => {
        const resubmissionFixture = await setupBaseFixture()
        const oldJobCreatedAt = new Date(Date.now() - 10 * 60_000)
        const resubmittedAt = new Date()

        await db
            .updateTable('studyJob')
            .set({ createdAt: oldJobCreatedAt })
            .where('id', '=', resubmissionFixture.job.id)
            .execute()
        await insertTestJobStatus(resubmissionFixture.job.id, 'CODE-CHANGES-REQUESTED', {
            at: new Date(resubmittedAt.getTime() - 1_000),
        })
        await insertTestJobStatus(resubmissionFixture.job.id, 'CODE-SUBMITTED', { at: resubmittedAt })

        await renderSection(await refreshFixtureJob(resubmissionFixture))

        expect(await screen.findByTestId('ai-summary-pending')).toHaveTextContent('Generating summary')
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
    })

    it('keeps loading across two resubmission rounds on the same reused job', async () => {
        const resubmissionFixture = await setupBaseFixture()
        const day = 24 * 60 * 60 * 1000
        const originalSubmittedAt = new Date(Date.now() - 5 * day)

        await db
            .updateTable('studyJob')
            .set({ createdAt: originalSubmittedAt })
            .where('id', '=', resubmissionFixture.job.id)
            .execute()
        const statuses: { status: StudyJobStatus; createdAt: Date }[] = [
            { status: 'CODE-CHANGES-REQUESTED', createdAt: new Date(Date.now() - 4 * day) },
            { status: 'CODE-SUBMITTED', createdAt: new Date(Date.now() - 3 * day) },
            { status: 'CODE-CHANGES-REQUESTED', createdAt: new Date(Date.now() - 2 * day) },
            { status: 'CODE-SUBMITTED', createdAt: new Date() },
        ]
        for (const { status, createdAt } of statuses) {
            await insertTestJobStatus(resubmissionFixture.job.id, status, { at: createdAt })
        }

        const job = await latestJobForStudy(resubmissionFixture.study.id)
        expect(new Date(latestCodeSubmittedAt(job)).getTime()).toBe(statuses[3].createdAt.getTime())

        await renderSection(await refreshFixtureJob(resubmissionFixture))

        expect(await screen.findByTestId('ai-summary-pending')).toHaveTextContent('Generating summary')
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
    })

    it('surfaces the error + retry state immediately when a failed review row exists', async () => {
        const failedFixture = await setupBaseFixture()
        await insertFailedStudyReview(failedFixture.job.id)
        const initialReview = (await jobAnalysisForJob(failedFixture.job)).review
        // submittedAt anchored to now so the backstop has not elapsed: the error can only come
        // from the persisted failure row.
        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={failedFixture.job.id}
                initialAnalysis={{ review: initialReview, scan: scanInProgress }}
                submittedAt={new Date()}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )

        const error = await screen.findByTestId('ai-summary-error')
        expect(error).toHaveTextContent('The AI summary failed to generate.')
        expect(screen.getByTestId('ai-summary-retry')).toBeInTheDocument()
        expect(screen.queryByTestId('ai-summary-pending')).not.toBeInTheDocument()
    })

    it('puts Retry below the failure banner, not inside it', async () => {
        const failedFixture = await setupBaseFixture()
        await insertFailedStudyReview(failedFixture.job.id)
        const initialReview = (await jobAnalysisForJob(failedFixture.job)).review
        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={failedFixture.job.id}
                initialAnalysis={{ review: initialReview, scan: scanInProgress }}
                submittedAt={new Date()}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )

        const banner = within(await screen.findByTestId('ai-summary-error')).getByRole('alert')
        const retry = screen.getByTestId('ai-summary-retry')
        expect(banner).toHaveTextContent('The AI summary failed to generate.')
        expect(banner).not.toContainElement(retry)
        expect(banner.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('retrying a failed summary clears the failure row and drops back to pending', async () => {
        const failedFixture = await setupBaseFixture()
        await insertFailedStudyReview(failedFixture.job.id)
        const initialReview = (await jobAnalysisForJob(failedFixture.job)).review
        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={failedFixture.job.id}
                initialAnalysis={{ review: initialReview, scan: scanInProgress }}
                submittedAt={new Date(Date.now() - 10 * 60_000)}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )

        const user = userEvent.setup()
        await user.click(await screen.findByTestId('ai-summary-retry'))

        await waitFor(() => expect(screen.getByTestId('ai-summary-pending')).toBeInTheDocument())
        const remaining = (await jobAnalysisForJob(failedFixture.job)).review
        expect(remaining?.summaryFailedAt ?? null).toBeNull()
    })

    // The reported defect: the panel called a generation failed at three minutes while the server
    // was still working on it, and Retry restarted the same wait (OTTER-799).
    it('keeps the spinner while the server says a run is still going, past the submission backstop', async () => {
        const liveFixture = await setupBaseFixture()
        await insertPendingStudyReview(liveFixture.job.id, new Date())
        const initialReview = (await jobAnalysisForJob(liveFixture.job)).review

        fakeTimeouts()
        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={liveFixture.job.id}
                initialAnalysis={{ review: initialReview, scan: scanInProgress }}
                submittedAt={new Date()}
                summaryTimeoutMs={50}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )

        await advanceTimers(80)
        expect(screen.getByTestId('ai-summary-pending')).toBeInTheDocument()
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
    })

    it('offers the retry once a claimed run is old enough to have died', async () => {
        const deadFixture = await setupBaseFixture()
        await insertPendingStudyReview(deadFixture.job.id, new Date(Date.now() - 15 * 60_000))
        const initialReview = (await jobAnalysisForJob(deadFixture.job)).review

        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={deadFixture.job.id}
                initialAnalysis={{ review: initialReview, scan: scanInProgress }}
                submittedAt={new Date()}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )

        expect(await screen.findByTestId('ai-summary-error')).toHaveTextContent('The AI summary failed to generate.')
        expect(screen.getByTestId('ai-summary-retry')).toBeInTheDocument()
    })

    it('retrying a run that died clears the row and drops back to pending', async () => {
        const deadFixture = await setupBaseFixture()
        await insertPendingStudyReview(deadFixture.job.id, new Date(Date.now() - 15 * 60_000))
        const initialReview = (await jobAnalysisForJob(deadFixture.job)).review

        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={deadFixture.job.id}
                initialAnalysis={{ review: initialReview, scan: scanInProgress }}
                submittedAt={new Date()}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )

        const user = userEvent.setup()
        await user.click(await screen.findByTestId('ai-summary-retry'))

        await waitFor(() => expect(screen.getByTestId('ai-summary-pending')).toBeInTheDocument())
    })

    // The scan settles first on a large submission, so the summary is the only thing left to wait
    // for and it is the row, not the clock, that has to keep the poll alive.
    it('keeps polling while the row reports a run in progress and the scan has settled', async () => {
        const pollFixture = await setupBaseFixture()
        await insertPendingStudyReview(pollFixture.job.id, new Date())
        await insertScanLog(pollFixture.job.id, 'no findings')
        const initialAnalysis = await jobAnalysisForJob(pollFixture.job)
        const queryClient = createTestQueryClient()
        const polls = watchPolls(queryClient)

        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={pollFixture.job.id}
                initialAnalysis={initialAnalysis}
                submittedAt={new Date()}
                pollIntervalMs={20}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
            { queryClient },
        )

        await waitFor(() => expect(polls.started).toBeGreaterThan(1))
        expect(screen.getByTestId('ai-summary-pending')).toBeInTheDocument()
    })

    it('flips the spinner to an error once the backstop elapses past submission with no row', async () => {
        const noReviewFixture = await setupBaseFixture()
        const initialReview = (await jobAnalysisForJob(noReviewFixture.job)).review
        // A short backstop exercises the escalation without fake timers, which break the shared
        // DB pool mid-file.
        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={noReviewFixture.job.id}
                initialAnalysis={{ review: initialReview, scan: scanInProgress }}
                submittedAt={new Date()}
                summaryTimeoutMs={50}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )
        expect(screen.getByTestId('ai-summary-pending')).toBeInTheDocument()

        const error = await screen.findByTestId('ai-summary-error')
        expect(error).toHaveTextContent('The AI summary failed to generate.')
        expect(screen.queryByTestId('ai-summary-pending')).not.toBeInTheDocument()
    })

    // 8.4% of measured generations land past the backstop. Stopping the poll there stranded a
    // report that was already in the database until a reload (OTTER-775 review).
    it('keeps polling past the summary backstop and replaces the error when the report lands', async () => {
        const fixture = await setupBaseFixture()

        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={fixture.job.id}
                initialAnalysis={{ review: null, scan: scanInProgress }}
                submittedAt={new Date()}
                summaryTimeoutMs={30}
                pollIntervalMs={20}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )

        await screen.findByTestId('ai-summary-error')

        await insertStudyReview(fixture.job.id, 'Late but real summary')

        expect(await screen.findByTestId('ai-summary-body')).toHaveTextContent('Late but real summary')
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
    })

    // A seeded summary stops the poll, so the refetch that can still fail under it is the stale
    // one the app's client runs on mount; a failure there must not discard what the reviewer is
    // already reading (OTTER-775 review).
    it('keeps a rendered summary when the refetch under it fails', async () => {
        const fixture = await setupBaseFixture()
        await insertStudyReview(fixture.job.id, 'Summary of the submitted code')
        const review = (await jobAnalysisForJob(fixture.job)).review
        // Another enclave's session may not view this job, so the refetch is refused.
        await mockSessionWithTestData({ orgType: 'enclave' })

        // The test client opts out of refetchOnMount; the app's does not (OTTER-694).
        const queryClient = createTestQueryClient()
        queryClient.setDefaultOptions({ queries: { retry: false, refetchOnMount: true } })
        const polls = watchPolls(queryClient)

        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={fixture.job.id}
                initialAnalysis={{ review, scan: scanInProgress }}
                submittedAt={new Date()}
                pollIntervalMs={20}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
            { queryClient },
        )

        await waitFor(() => expect(polls.failed).toBeGreaterThan(0))
        expect(screen.getByTestId('ai-summary-body')).toHaveTextContent('Summary of the submitted code')
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
    })

    it('errors immediately when the page is opened long after a submission that never produced a row', async () => {
        const staleFixture = await setupBaseFixture()
        const initialReview = (await jobAnalysisForJob(staleFixture.job)).review
        // Beyond the backstop: the spinner must not even flash.
        const longAgo = new Date(Date.now() - 10 * 60_000)
        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={staleFixture.job.id}
                initialAnalysis={{ review: initialReview, scan: scanInProgress }}
                submittedAt={longAgo}
                summaryTimeoutMs={180_000}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )
        expect(screen.getByTestId('ai-summary-error')).toBeInTheDocument()
        expect(screen.queryByTestId('ai-summary-pending')).not.toBeInTheDocument()
    })

    it('keeps the blank-summary empty-state and never errors once a row exists, even past the backstop', async () => {
        const blankFixture = await setupBaseFixture()
        await insertStudyReview(blankFixture.job.id, '')
        const initialReview = (await jobAnalysisForJob(blankFixture.job)).review
        fakeTimeouts()
        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={blankFixture.job.id}
                initialAnalysis={{ review: initialReview, scan: scanInProgress }}
                submittedAt={blankFixture.job.createdAt}
                summaryTimeoutMs={50}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )

        await waitFor(() => expect(screen.getByTestId('ai-summary-empty')).toBeInTheDocument())
        await advanceTimers(60)
        expect(screen.getByTestId('ai-summary-empty')).toHaveTextContent('No AI summary available yet.')
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
    })

    it('falls back to an empty-state when a review row exists but the summary is blank', async () => {
        const blankFixture = await setupBaseFixture()
        await insertStudyReview(blankFixture.job.id, '')
        await renderSection(blankFixture)
        expect(screen.getByTestId('ai-summary-empty')).toHaveTextContent('No AI summary available yet.')
        expect(screen.queryByTestId('ai-summary-toggle')).not.toBeInTheDocument()
        expect(screen.queryByTestId('ai-summary-pending')).not.toBeInTheDocument()
    })
})

describe('SubmittedCodeSection — Security scan results', () => {
    it.each(['PASSED', 'FAILED', 'INDETERMINATE', 'NOT-RUN'] as const)(
        'renders %s scan results before the summary',
        async (status) => {
            const fixture = await setupBaseFixture()
            await renderSection(fixture, scanResult(status))
            const scan = screen.getByTestId('security-scan-results')
            const summary = screen.getByTestId('ai-summary')
            expect(scan.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
            if (status === 'PASSED') expect(within(scan).getByLabelText('Passed')).toBeInTheDocument()
            if (status === 'FAILED') expect(within(scan).getByLabelText('Failed')).toBeInTheDocument()
            if (status === 'INDETERMINATE') expect(scan).toHaveTextContent('indeterminate')
            if (status === 'NOT-RUN') expect(scan).toHaveTextContent('did not run')
        },
    )

    it('shows the scan log clamped, and expands it on toggle', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanResult('PASSED'))
        const body = screen.getByTestId('scan-details-body')
        expect(body).toHaveTextContent('main.r:28 INFO')
        expect(body.style.getPropertyValue('--text-line-clamp')).toBe('2')

        await userEvent.setup().click(screen.getByTestId('scan-details-toggle'))

        expect(body.style.getPropertyValue('--text-line-clamp')).toBe('')
        expect(screen.getByTestId('scan-details-toggle')).toHaveTextContent('Hide full scan details')
        expect(screen.queryByTestId('scan-details-scroll')).not.toBeInTheDocument()
    })

    it('shows no details box when the log has nothing past its status line', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanResult('PASSED', null))
        expect(screen.queryByTestId('scan-details-body')).not.toBeInTheDocument()
    })

    it('announces the pending scan in a status region', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanInProgress)
        expect(within(screen.getByTestId('security-scan-results')).getByRole('status')).toHaveTextContent(
            'Security scan pending',
        )
    })
})

describe('SubmittedCodeSection — Analysis polling', () => {
    it('stops polling once both the summary and scan have arrived', async () => {
        const fixture = await setupBaseFixture()
        await insertStudyReview(fixture.job.id, 'Summary of the submitted code')
        await insertScanLog(fixture.job.id, 'no findings')
        const queryClient = createTestQueryClient()
        const polls = watchPolls(queryClient)

        fakeTimeouts()
        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={fixture.job.id}
                initialAnalysis={{ review: null, scan: scanInProgress }}
                submittedAt={new Date()}
                pollIntervalMs={20}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
            { queryClient },
        )
        await waitFor(() => expect(screen.getByTestId('ai-summary-body')).toBeInTheDocument())

        await expectPollingStopped(polls)
    })

    it('polls analysis for the current job', async () => {
        const fixture = await setupBaseFixture()

        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={fixture.job.id}
                initialAnalysis={{ review: null, scan: scanInProgress }}
                submittedAt={new Date()}
                pollIntervalMs={20}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )
        await insertStudyReview(fixture.job.id, 'Summary of the submitted code')

        expect(await screen.findByTestId('ai-summary-body')).toHaveTextContent('Summary of the submitted code')
    })

    it('keeps polling after the summary arrives until the scan settles', async () => {
        const fixture = await setupBaseFixture()
        await insertStudyReview(fixture.job.id, 'Summary of the submitted code')
        const review = (await jobAnalysisForJob(fixture.job)).review
        const queryClient = createTestQueryClient()
        const polls = watchPolls(queryClient)
        fakeTimeouts()
        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={fixture.job.id}
                initialAnalysis={{ review, scan: scanInProgress }}
                submittedAt={new Date()}
                pollIntervalMs={20}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
            { queryClient },
        )
        await waitFor(() => expect(polls.started).toBeGreaterThan(1))
        expect(screen.getByText('Security scan pending')).toBeInTheDocument()
        await insertScanLog(fixture.job.id, 'findings found')
        await waitFor(() => expect(screen.getByTestId('security-scan-results')).toHaveTextContent('Semgrep: Failed'))
        await expectPollingStopped(polls)
    })

    it('keeps polling until the summary arrives', async () => {
        const fixture = await setupBaseFixture()
        const queryClient = createTestQueryClient()
        const polls = watchPolls(queryClient)

        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={fixture.job.id}
                initialAnalysis={{ review: null, scan: scanInProgress }}
                submittedAt={new Date()}
                pollIntervalMs={20}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
            { queryClient },
        )
        expect(screen.getByTestId('ai-summary-pending')).toBeInTheDocument()

        const afterFirst = polls.started
        await waitFor(() => expect(polls.started).toBeGreaterThan(afterFirst))
        expect(screen.getByTestId('ai-summary-pending')).toBeInTheDocument()
    })
})

describe('SubmittedCodeSection collapsed preview', () => {
    it('keeps the first two blocks visible and collapses the rest behind the opener', async () => {
        const fixture = await setupBaseFixture()
        const analysis = await jobAnalysisForJob(fixture.job)
        renderWithProviders(
            <SubmittedCodeSection
                orgSlug={ORG_SLUG}
                study={fixture.study}
                job={fixture.job}
                analysis={{ ...analysis, scan: scanResult('PASSED') }}
                detailsExpanded={false}
                onExpand={vi.fn()}
                onCollapse={vi.fn()}
            />,
        )

        expect(screen.getByTestId('submitted-code-datasets')).toBeVisible()
        expect(screen.getByTestId('security-scan-results')).toBeVisible()
        expect(screen.getByTestId('ai-summary')).not.toBeVisible()
        expect(screen.getByTestId('study-code-viewer')).not.toBeVisible()
        const opener = screen.getByTestId('study-code-toggle')
        expect(opener).toHaveTextContent('View full submission details')
        expect(
            screen.getByTestId('security-scan-results').compareDocumentPosition(opener) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
    })

    it('previews whichever blocks are present first', async () => {
        const fixture = await setupBaseFixture()
        renderWithProviders(
            <JobAnalysisPanels
                studyJobId={fixture.job.id}
                initialAnalysis={{ review: null, scan: scanResult('PASSED') }}
                submittedAt={new Date()}
                detailsExpanded={false}
                expandToggle={<button type="button">Open details</button>}
                leadingBlocks={[{ key: 'retired', isVisible: false, content: <p>Retired block</p> }]}
            >
                <p>Code files block</p>
            </JobAnalysisPanels>,
        )

        expect(screen.queryByText('Retired block')).not.toBeInTheDocument()
        expect(screen.getByTestId('security-scan-results')).toBeVisible()
        expect(screen.getByTestId('ai-summary')).toBeVisible()
        expect(screen.getByRole('button', { name: 'Open details' })).toBeVisible()
        expect(screen.getByText('Code files block')).not.toBeVisible()
    })
})

describe("SubmittedCodeSection — Displaying RL's code", () => {
    async function setupFilesFixture(fileNames: string[]) {
        const fixture = await setupBaseFixture()
        await insertStudyJobFile(fixture.job.id, fileNames[0], 'MAIN-CODE')
        for (const name of fileNames.slice(1)) {
            await insertStudyJobFile(fixture.job.id, name, 'SUPPLEMENTAL-CODE')
        }
        return refreshFixtureJob(fixture)
    }

    it('renders a "Code files" heading above the file tabs, which share its name', async () => {
        const fixture = await setupFilesFixture(['main.R'])
        await renderSection(fixture)
        const heading = screen.getByText('Code files')
        const tabs = screen.getByRole('tablist', { name: 'Code files' })
        expect(heading.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('renders every file as a tab in one row, main file first', async () => {
        const fixture = await setupFilesFixture(['main.R', 'a.R', 'b.R', 'c.R', 'd.R', 'e.R', 'f.R'])
        await renderSection(fixture)
        const names = within(screen.getByRole('tablist'))
            .getAllByRole('tab')
            .map((tab) => tab.getAttribute('title'))
        expect(names).toEqual(['main.R', 'a.R', 'b.R', 'c.R', 'd.R', 'e.R', 'f.R'])
    })

    it('selects the main code file by default', async () => {
        const fixture = await setupFilesFixture(['main.R', 'helpers.R'])
        await renderSection(fixture)
        expect(screen.getByRole('tab', { name: 'main.R' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('tab', { name: 'helpers.R' })).toHaveAttribute('aria-selected', 'false')
    })

    it('switches the active tab when another file is clicked', async () => {
        const fixture = await setupFilesFixture(['main.R', 'helpers.R'])
        await renderSection(fixture)
        await userEvent.setup().click(screen.getByRole('tab', { name: 'helpers.R' }))

        expect(screen.getByRole('tab', { name: 'main.R' })).toHaveAttribute('aria-selected', 'false')
        expect(screen.getByRole('tab', { name: 'helpers.R' })).toHaveAttribute('aria-selected', 'true')
    })

    it('names a tab with the full file name even when the label is cut short', async () => {
        const longName = 'a-very-long-supplemental-code-filename.R'
        const fixture = await setupFilesFixture(['main.R', longName])
        await renderSection(fixture)
        expect(screen.getByRole('tab', { name: longName })).toHaveAttribute('title', longName)
    })

    it('renders the study code body expanded by default and hides it when toggled', async () => {
        const fixture = await setupFilesFixture(['main.R'])
        await renderSection(fixture)
        await waitFor(() => expect(screen.getByTestId('study-code-body')).toBeInTheDocument())

        const user = userEvent.setup()
        const toggle = screen.getByTestId('study-code-toggle')
        expect(toggle).toHaveTextContent('Hide full submission details')
        await user.click(toggle)

        expect(screen.queryByTestId('study-code-body')).not.toBeInTheDocument()
        expect(screen.queryByTestId('study-code-body-loading')).not.toBeInTheDocument()
        expect(toggle).toHaveTextContent('View full submission details')

        await user.click(toggle)
        await waitFor(() => expect(screen.getByTestId('study-code-body')).toBeInTheDocument())
        expect(toggle).toHaveTextContent('Hide full submission details')
    })

    it('hides the show/hide toggle when there are no code files', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture)
        expect(screen.queryByTestId('study-code-toggle')).not.toBeInTheDocument()
    })

    it('shows the code body up front and calls onCollapse from the closer toggle in onCollapse mode', async () => {
        const fixture = await setupFilesFixture(['main.R'])
        const analysis = await jobAnalysisForJob(fixture.job)
        const onCollapse = vi.fn()
        renderWithProviders(
            <SubmittedCodeSection
                orgSlug={ORG_SLUG}
                study={fixture.study}
                job={fixture.job}
                analysis={analysis}
                onCollapse={onCollapse}
            />,
        )
        await waitFor(() => expect(screen.getByTestId('study-code-body')).toBeInTheDocument())

        const closer = screen.getByTestId('study-code-toggle-collapse')
        expect(closer).toHaveTextContent('Hide full submission details')
        expect(screen.queryByTestId('study-code-toggle')).not.toBeInTheDocument()

        await userEvent.setup().click(closer)
        expect(onCollapse).toHaveBeenCalledTimes(1)
    })

    it('keeps the closer toggle visible in onCollapse mode when there are no code files', async () => {
        const fixture = await setupBaseFixture()
        const analysis = await jobAnalysisForJob(fixture.job)
        const onCollapse = vi.fn()
        renderWithProviders(
            <SubmittedCodeSection
                orgSlug={ORG_SLUG}
                study={fixture.study}
                job={fixture.job}
                analysis={analysis}
                onCollapse={onCollapse}
            />,
        )
        const closer = await screen.findByTestId('study-code-toggle-collapse')
        expect(closer).toHaveTextContent('Hide full submission details')

        await userEvent.setup().click(closer)
        expect(onCollapse).toHaveBeenCalledTimes(1)
    })

    it('renders the file contents inside the body once loaded', async () => {
        const fixture = await setupFilesFixture(['main.R'])
        await renderSection(fixture)
        const body = await screen.findByTestId('study-code-body')
        expect(body).toHaveTextContent('print')
        expect(body).toHaveTextContent('hello from main.R')
        expect(body).toHaveTextContent('main.R')
    })

    // OTTER-516: a png submitted alongside code can be the active tab, so the body must render it
    // as an image rather than decoding its bytes to text.
    it('renders a png tab as an image instead of decoded text', async () => {
        vi.mocked(fetchFileContents).mockImplementation(async (path: string) =>
            path.endsWith('.png')
                ? new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])])
                : new Blob(['print("hello from main.R")\n']),
        )
        const fixture = await setupFilesFixture(['main.R', 'plot.png'])
        await renderSection(fixture)
        await userEvent.setup().click(screen.getByRole('tab', { name: 'plot.png' }))

        const body = await screen.findByTestId('study-code-body')
        await waitFor(() => {
            expect(within(body).getByAltText('plot.png')).toBeInTheDocument()
        })
    })

    it('downloads a file from the icon on its tab without switching tabs (OTTER-608)', async () => {
        const fixture = await setupFilesFixture(['main.R', 'helpers.R'])
        await renderSection(fixture)
        const downloads: { href: string | null; download: string }[] = []
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            downloads.push({ href: this.getAttribute('href'), download: this.download })
        })

        const helpersTab = screen.getByRole('tab', { name: 'helpers.R' })
        await userEvent.setup().click(within(helpersTab).getByTestId('study-code-tab-download'))

        expect(downloads).toEqual([{ href: `/dl/study-code/${fixture.job.id}/helpers.R`, download: 'helpers.R' }])
        expect(helpersTab).toHaveAttribute('aria-selected', 'false')
    })

    it('gives keyboard users a download link for the selected file (OTTER-608)', async () => {
        const fixture = await setupFilesFixture(['main.R', 'helpers.R'])
        await renderSection(fixture)

        const mainDownload = screen.getByRole('link', { name: 'Download main.R' })
        expect(mainDownload).toHaveAttribute('href', `/dl/study-code/${fixture.job.id}/main.R`)
        expect(mainDownload).toHaveAttribute('download', 'main.R')

        await userEvent.setup().click(screen.getByRole('tab', { name: 'helpers.R' }))

        const helpersDownload = screen.getByRole('link', { name: 'Download helpers.R' })
        expect(helpersDownload).toHaveAttribute('href', `/dl/study-code/${fixture.job.id}/helpers.R`)
    })
})

describe('SubmittedCodeSection — pure helpers', () => {
    const block = (key: string, isVisible?: boolean) => ({ key, isVisible, content: key })

    it('splitPreviewBlocks previews the first blocks and leaves the rest', () => {
        const { preview, rest } = splitPreviewBlocks([block('a'), block('b'), block('c'), block('d')], 2)
        expect(preview.map((b) => b.key)).toEqual(['a', 'b'])
        expect(rest.map((b) => b.key)).toEqual(['c', 'd'])
    })

    it('splitPreviewBlocks moves the next block up when one is not visible', () => {
        const { preview, rest } = splitPreviewBlocks([block('a'), block('b', false), block('c'), block('d')], 2)
        expect(preview.map((b) => b.key)).toEqual(['a', 'c'])
        expect(rest.map((b) => b.key)).toEqual(['d'])
    })

    it('splitPreviewBlocks leaves nothing to collapse when there are too few blocks', () => {
        const { preview, rest } = splitPreviewBlocks([block('a'), block('b')], 2)
        expect(preview.map((b) => b.key)).toEqual(['a', 'b'])
        expect(rest).toEqual([])
    })

    it('splitPreviewBlocks keeps an always-collapsed block out of the preview', () => {
        const closer = { key: 'closer', alwaysCollapsed: true, content: 'closer' }
        const { preview, rest } = splitPreviewBlocks([block('a'), block('b', false), closer], 2)
        expect(preview.map((b) => b.key)).toEqual(['a'])
        expect(rest.map((b) => b.key)).toEqual(['closer'])
    })

    it('latestCodeSubmittedAt returns the CODE-SUBMITTED event timestamp when present', () => {
        const createdAt = new Date('2026-01-01')
        const resubmittedAt = '2026-07-10T00:00:00.000Z'
        const job = {
            createdAt,
            statusChanges: [
                { status: 'CODE-SUBMITTED' as const, createdAt: resubmittedAt },
                { status: 'CODE-CHANGES-REQUESTED' as const, createdAt: '2026-07-09T00:00:00.000Z' },
            ],
        }
        expect(latestCodeSubmittedAt(job)).toBe(resubmittedAt)
    })

    it('latestCodeSubmittedAt falls back to createdAt when no CODE-SUBMITTED event exists', () => {
        const createdAt = new Date('2026-01-01')
        const job = {
            createdAt,
            statusChanges: [{ status: 'INITIATED' as const, createdAt: createdAt.toISOString() }],
        }
        expect(latestCodeSubmittedAt(job)).toBe(createdAt)
    })

    it('latestCodeSubmittedAt uses the newest CODE-SUBMITTED event (array is desc-ordered)', () => {
        const old = '2026-01-01T00:00:00.000Z'
        const recent = '2026-07-10T00:00:00.000Z'
        const job = {
            createdAt: new Date(old),
            statusChanges: [
                { status: 'CODE-SUBMITTED' as const, createdAt: recent },
                { status: 'CODE-CHANGES-REQUESTED' as const, createdAt: '2026-06-01T00:00:00.000Z' },
                { status: 'CODE-SUBMITTED' as const, createdAt: old },
            ],
        }
        expect(latestCodeSubmittedAt(job)).toBe(recent)
    })

    it('latestCodeSubmittedAt picks the newest even when the array is not desc-ordered', () => {
        const old = '2026-01-01T00:00:00.000Z'
        const recent = '2026-07-10T00:00:00.000Z'
        const job = {
            createdAt: new Date(old),
            statusChanges: [
                { status: 'CODE-SUBMITTED' as const, createdAt: old },
                { status: 'CODE-CHANGES-REQUESTED' as const, createdAt: '2026-06-01T00:00:00.000Z' },
                { status: 'CODE-SUBMITTED' as const, createdAt: recent },
            ],
        }
        expect(latestCodeSubmittedAt(job)).toBe(recent)
    })
})
