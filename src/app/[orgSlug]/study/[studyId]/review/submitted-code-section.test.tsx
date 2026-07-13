import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import type { StudyJobStatus } from '@/database/types'
import {
    actionResult,
    db,
    fireEvent,
    insertTestDataSource,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    type Mock,
    waitFor,
    within,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    getStudyReviewForJob,
    type JobScanResult,
    jobScanResultForJob,
    latestJobForStudy,
    type LatestJobForStudy,
} from '@/server/db/queries'
import { SubmittedCodeSection, latestCodeSubmittedAt } from './submitted-code-section'
import { AiSummaryCollapsible, splitVisibleFiles, truncateFileName } from './submitted-code-interactive'

vi.mock('@/server/storage', async () => {
    const actual = await vi.importActual<typeof import('@/server/storage')>('@/server/storage')
    return {
        ...actual,
        fetchFileContents: vi.fn(async () => new Blob(['print("hello from main.R")\n'])),
    }
})

const ORG_SLUG = 'test-org-submitted'

async function insertStudyJobFile(
    studyJobId: string,
    name: string,
    fileType: 'MAIN-CODE' | 'SUPPLEMENTAL-CODE' | 'ENCRYPTED-SECURITY-SCAN-LOG',
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

// A failed generation persists a row with no report and summaryFailedAt set —
// the signal the reviewer-side panel turns into the error + retry state.
async function insertFailedStudyReview(studyJobId: string) {
    return db
        .insertInto('studyReview')
        .values({ studyJobId, report: null, summaryFailedAt: new Date() })
        .returningAll()
        .executeTakeFirstOrThrow()
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

// Tests that mutate the job (insert files) call this to refresh the cached job
// so SubmittedCodeSection sees the latest files in its props.
async function refreshFixtureJob(fixture: Fixture): Promise<Fixture> {
    return { ...fixture, job: await latestJobForStudy(fixture.study.id) }
}

async function renderSection(fixture: Fixture, scanOverride?: JobScanResult) {
    const [review, scan] = await Promise.all([
        getStudyReviewForJob(fixture.job.id),
        scanOverride ? Promise.resolve(scanOverride) : jobScanResultForJob(fixture.job.id),
    ])
    return renderWithProviders(
        <SubmittedCodeSection orgSlug={ORG_SLUG} study={fixture.study} job={fixture.job} review={review} scan={scan} />,
    )
}

describe('SubmittedCodeSection — Section header', () => {
    let fixture: Fixture

    beforeEach(async () => {
        fixture = await setupBaseFixture()
    })

    it('renders section title "Submitted code"', async () => {
        await renderSection(fixture)
        expect(screen.getByRole('heading', { name: 'Submitted code', level: 3 })).toBeInTheDocument()
    })

    it('renders "View approved initial request" link that opens the approved-proposal feedback page in a new tab', async () => {
        await renderSection(fixture)
        const link = screen.getByTestId('view-approved-initial-request')
        expect(link).toHaveTextContent('View approved initial request')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
        // OTTER-540: must point at the approved *initial request* (proposal feedback),
        // served by the dedicated /review/proposal route.
        expect(link).toHaveAttribute('href', `/${ORG_SLUG}/study/${fixture.study.id}/review/proposal`)
    })

    it('renders the section content beneath the header', async () => {
        await renderSection(fixture)
        // The section root contains the header followed by everything else; this
        // proves the divider/content sequence rendered without throwing.
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

        // Non-interactive: no role=button or anchor inside the pill.
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

    it('renders section title "AI Summary: Analysis of all files" and the "Overview" subtitle', async () => {
        await renderSection(fixture)
        expect(screen.getByText('AI Summary: Analysis of all files')).toBeInTheDocument()
        expect(screen.getByText('Overview')).toBeInTheDocument()
    })

    it('renders the toggle with "View full AI summary" by default and shows a clamped snippet', async () => {
        await renderSection(fixture)
        expect(screen.getByTestId('ai-summary-toggle')).toHaveTextContent('View full AI summary')
        const body = screen.getByTestId('ai-summary-body')
        expect(body).toHaveTextContent(SUMMARY_TEXT)
        expect(body.style.getPropertyValue('--text-line-clamp')).toBe('3')
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

        expect(screen.getByTestId('ai-summary-body').style.getPropertyValue('--text-line-clamp')).toBe('3')
        expect(toggle).toHaveTextContent('View full AI summary')
    })

    it('shows the in-progress spinner while no review row exists yet (still generating)', async () => {
        const noReviewFixture = await setupBaseFixture()
        await renderSection(noReviewFixture)
        // The review is generated by a deferred background task; until the row
        // lands the panel polls and shows the pending state rather than an empty
        // or summary state.
        expect(await screen.findByTestId('ai-summary-pending')).toHaveTextContent('AI Summary is loading')
        expect(screen.queryByTestId('ai-summary-toggle')).not.toBeInTheDocument()
        expect(screen.queryByTestId('ai-summary-empty')).not.toBeInTheDocument()
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
        // "Overview" only accompanies a rendered summary, never the spinner.
        expect(screen.queryByText('Overview')).not.toBeInTheDocument()
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
        await db
            .insertInto('jobStatusChange')
            .values([
                {
                    studyJobId: resubmissionFixture.job.id,
                    status: 'CODE-CHANGES-REQUESTED',
                    createdAt: new Date(resubmittedAt.getTime() - 1_000),
                },
                { studyJobId: resubmissionFixture.job.id, status: 'CODE-SUBMITTED', createdAt: resubmittedAt },
            ])
            .execute()

        await renderSection(await refreshFixtureJob(resubmissionFixture))

        expect(await screen.findByTestId('ai-summary-pending')).toHaveTextContent('AI Summary is loading')
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
    })

    // latestCodeSubmittedAt's own unit tests only exercise a hand-built statusChanges
    // array. This drives the same shape through the real query (latestJobForStudy's
    // jsonArrayFrom + orderBy) with two full resubmission rounds on one reused job, so
    // a regression that dropped the latest CODE-SUBMITTED (e.g. picking the original
    // createdAt instead) would surface here through the real serialized payload.
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
        await db
            .insertInto('jobStatusChange')
            .values(statuses.map((change) => ({ ...change, studyJobId: resubmissionFixture.job.id })))
            .execute()

        const job = await latestJobForStudy(resubmissionFixture.study.id)
        expect(new Date(latestCodeSubmittedAt(job)).getTime()).toBe(statuses[3].createdAt.getTime())

        await renderSection(await refreshFixtureJob(resubmissionFixture))

        expect(await screen.findByTestId('ai-summary-pending')).toHaveTextContent('AI Summary is loading')
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
    })

    it('surfaces the error + retry state immediately when a failed review row exists', async () => {
        const failedFixture = await setupBaseFixture()
        await insertFailedStudyReview(failedFixture.job.id)
        const initialReview = await getStudyReviewForJob(failedFixture.job.id)
        // Anchor submittedAt to now so the backstop has *not* elapsed: the error
        // can then only come from the persisted failure row, not from `timedOut`.
        renderWithProviders(
            <AiSummaryCollapsible
                studyJobId={failedFixture.job.id}
                initialReview={initialReview}
                submittedAt={new Date()}
            />,
        )

        const error = await screen.findByTestId('ai-summary-error')
        expect(error).toHaveTextContent('The AI summary failed to generate.')
        expect(screen.getByTestId('ai-summary-retry')).toBeInTheDocument()
        // A persisted failure is terminal — no spinner, even though it landed fast.
        expect(screen.queryByTestId('ai-summary-pending')).not.toBeInTheDocument()
        // "Overview" belongs to the summary body, not the error alert.
        expect(screen.queryByText('Overview')).not.toBeInTheDocument()
    })

    it('retrying a failed summary clears the failure row and drops back to pending', async () => {
        const failedFixture = await setupBaseFixture()
        await insertFailedStudyReview(failedFixture.job.id)
        const initialReview = await getStudyReviewForJob(failedFixture.job.id)
        renderWithProviders(
            <AiSummaryCollapsible
                studyJobId={failedFixture.job.id}
                initialReview={initialReview}
                submittedAt={new Date(Date.now() - 10 * 60_000)}
            />,
        )

        const user = userEvent.setup()
        await user.click(await screen.findByTestId('ai-summary-retry'))

        // A retry is a new generation request, so it resets an already-elapsed
        // backstop and returns to pending while the new result is polled.
        await waitFor(() => expect(screen.getByTestId('ai-summary-pending')).toBeInTheDocument())
        const remaining = await getStudyReviewForJob(failedFixture.job.id)
        expect(remaining?.summaryFailedAt ?? null).toBeNull()
    })

    it('flips the spinner to an error once the backstop elapses past submission with no row', async () => {
        const noReviewFixture = await setupBaseFixture()
        const initialReview = await getStudyReviewForJob(noReviewFixture.job.id)
        // No row ever lands (a hung generation). A short backstop measured from
        // submission exercises the escalation without faking timers (which break
        // the shared DB pool mid-file). Anchor submittedAt to *now* rather than the
        // fixture's createdAt: createdAt is already some ms in the past by the time
        // we render, and under a slow/parallel run that gap can exceed timeoutMs, so
        // the backstop would fire before the first assertion and the spinner would
        // never show (a flake seen in CI). Using `now` guarantees a fresh 50ms window
        // in which the spinner is visible before it flips to error.
        renderWithProviders(
            <AiSummaryCollapsible
                studyJobId={noReviewFixture.job.id}
                initialReview={initialReview}
                submittedAt={new Date()}
                timeoutMs={50}
            />,
        )
        expect(screen.getByTestId('ai-summary-pending')).toBeInTheDocument()

        const error = await screen.findByTestId('ai-summary-error')
        expect(error).toHaveTextContent('The AI summary failed to generate.')
        expect(screen.queryByTestId('ai-summary-pending')).not.toBeInTheDocument()
    })

    it('errors immediately when the page is opened long after a submission that never produced a row', async () => {
        const staleFixture = await setupBaseFixture()
        const initialReview = await getStudyReviewForJob(staleFixture.job.id)
        // Submitted well beyond the backstop: the spinner must not even flash.
        const longAgo = new Date(Date.now() - 10 * 60_000)
        renderWithProviders(
            <AiSummaryCollapsible
                studyJobId={staleFixture.job.id}
                initialReview={initialReview}
                submittedAt={longAgo}
                timeoutMs={180_000}
            />,
        )
        expect(screen.getByTestId('ai-summary-error')).toBeInTheDocument()
        expect(screen.queryByTestId('ai-summary-pending')).not.toBeInTheDocument()
    })

    it('keeps the blank-summary empty-state and never errors once a row exists, even past the backstop', async () => {
        const blankFixture = await setupBaseFixture()
        await insertStudyReview(blankFixture.job.id, '')
        const initialReview = await getStudyReviewForJob(blankFixture.job.id)
        renderWithProviders(
            <AiSummaryCollapsible
                studyJobId={blankFixture.job.id}
                initialReview={initialReview}
                submittedAt={blankFixture.job.createdAt}
                timeoutMs={50}
            />,
        )

        // Wait past the backstop window; a landed (blank) row must stay terminal.
        await waitFor(() => expect(screen.getByTestId('ai-summary-empty')).toBeInTheDocument())
        await new Promise((resolve) => setTimeout(resolve, 60))
        expect(screen.getByTestId('ai-summary-empty')).toHaveTextContent('No AI summary available yet.')
        expect(screen.queryByTestId('ai-summary-error')).not.toBeInTheDocument()
        // "Overview" only accompanies a rendered summary, never the empty-state.
        expect(screen.queryByText('Overview')).not.toBeInTheDocument()
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

describe('SubmittedCodeSection — Security scan log', () => {
    // These tests render the component with a known `scan` value passed directly,
    // rather than going through `jobScanResultForJob`. The query's own parsing is
    // covered by queries.test.ts; here we only care that the component renders the
    // right per-tool status text, warning icon, and download affordance.
    const scanResult = (trivy: JobScanResult['trivy'], sonarqube: JobScanResult['sonarqube']): JobScanResult => ({
        trivy,
        sonarqube,
        logFile: { id: 'scan-log-id', name: 'security-scan-log.txt', path: 'studies/x/security-scan-log.txt' },
    })

    const scanInProgress: JobScanResult = { trivy: null, sonarqube: null, logFile: null }

    it('renders section title "Security scan log" with no status icon in the title', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanResult('PASSED', 'PASSED'))
        expect(screen.getByTestId('security-scan-log')).toHaveTextContent('Security scan log')
    })

    it('renders both static tool labels in order', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanResult('PASSED', 'PASSED'))
        expect(screen.getByTestId('security-scan-trivy')).toHaveTextContent('Trivy Filesystem Scan:')
        expect(screen.getByTestId('security-scan-sonarqube')).toHaveTextContent('SonarQube Quality Gate:')
    })

    it('shows Trivy "No vulnerabilities found" with no warning icon when it passed', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanResult('PASSED', 'PASSED'))
        const row = screen.getByTestId('security-scan-trivy')
        expect(row).toHaveTextContent('No vulnerabilities found')
        expect(row.querySelector('[data-icon="warning"]')).toBeNull()
    })

    it('shows Trivy "Vulnerabilities found" with a warning icon when it failed', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanResult('FAILED', 'PASSED'))
        const row = screen.getByTestId('security-scan-trivy')
        expect(row).toHaveTextContent('Vulnerabilities found')
        expect(row.querySelector('[data-icon="warning"]')).not.toBeNull()
    })

    it('shows SonarQube "Passed" with no warning icon when it passed', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanResult('PASSED', 'PASSED'))
        const row = screen.getByTestId('security-scan-sonarqube')
        expect(row).toHaveTextContent('Passed')
        expect(row.querySelector('[data-icon="warning"]')).toBeNull()
    })

    it('shows SonarQube "Needs review" with a warning icon when it failed', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanResult('PASSED', 'FAILED'))
        const row = screen.getByTestId('security-scan-sonarqube')
        expect(row).toHaveTextContent('Needs review')
        expect(row.querySelector('[data-icon="warning"]')).not.toBeNull()
    })

    it('shows a download link to the plaintext scan log when a log file is present', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanResult('PASSED', 'PASSED'))
        const link = screen.getByTestId('security-scan-log-download')
        expect(link).toHaveTextContent('Download')
        expect(link).toHaveAttribute('href', `/dl/scan-log/${fixture.job.id}`)
    })

    it('keeps both labeled rows in a pending state, with no icon or download, when no scan log exists yet', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture, scanInProgress)
        const trivy = screen.getByTestId('security-scan-trivy')
        const sonar = screen.getByTestId('security-scan-sonarqube')
        expect(trivy).toHaveTextContent('Trivy Filesystem Scan:')
        expect(trivy).toHaveTextContent('Scan in progress')
        expect(sonar).toHaveTextContent('SonarQube Quality Gate:')
        expect(sonar).toHaveTextContent('Scan in progress')
        // No fabricated pass/fail while the status is unknown.
        expect(trivy.querySelector('[data-icon="warning"]')).toBeNull()
        expect(sonar.querySelector('[data-icon="warning"]')).toBeNull()
        expect(screen.queryByTestId('security-scan-log-download')).not.toBeInTheDocument()
    })
})

describe("SubmittedCodeSection — Displaying RL's code", () => {
    async function setupFilesFixture(fileNames: string[]) {
        const fixture = await setupBaseFixture()
        // First name becomes MAIN-CODE; the rest become SUPPLEMENTAL-CODE.
        await insertStudyJobFile(fixture.job.id, fileNames[0], 'MAIN-CODE')
        for (const name of fileNames.slice(1)) {
            await insertStudyJobFile(fixture.job.id, name, 'SUPPLEMENTAL-CODE')
        }
        // Refresh so fixture.job.files reflects what was just inserted.
        return refreshFixtureJob(fixture)
    }

    it('renders files in a single horizontal row with no wrapping', async () => {
        const fixture = await setupFilesFixture(['main.R', 'extra.R'])
        await renderSection(fixture)
        const tabs = screen.getByTestId('study-code-file-tabs')
        expect(tabs).toHaveStyle({ overflow: 'hidden' })
    })

    it('renders the main code file first and active by default', async () => {
        const fixture = await setupFilesFixture(['main.R', 'helpers.R'])
        await renderSection(fixture)
        const tabs = screen.getAllByTestId('study-code-file-tab')
        expect(tabs[0]).toHaveAttribute('title', 'main.R')
        expect(tabs[0].dataset.active).toBe('true')
        expect(tabs[1].dataset.active).toBe('false')
    })

    it('switches the active tab when another file is clicked', async () => {
        const fixture = await setupFilesFixture(['main.R', 'helpers.R'])
        await renderSection(fixture)
        const user = userEvent.setup()
        await user.click(screen.getAllByTestId('study-code-file-tab')[1])

        const tabs = screen.getAllByTestId('study-code-file-tab')
        expect(tabs[0].dataset.active).toBe('false')
        expect(tabs[1].dataset.active).toBe('true')
    })

    it('shows up to 4 tabs when total files ≤ 4', async () => {
        const fixture = await setupFilesFixture(['main.R', 'a.R', 'b.R', 'c.R'])
        await renderSection(fixture)
        expect(screen.getAllByTestId('study-code-file-tab')).toHaveLength(4)
        expect(screen.queryByTestId('study-code-files-overflow')).not.toBeInTheDocument()
    })

    it('replaces the last visible tab with "+{x} more files" when total files > 4', async () => {
        const fixture = await setupFilesFixture(['main.R', 'a.R', 'b.R', 'c.R', 'd.R'])
        await renderSection(fixture)
        expect(screen.getAllByTestId('study-code-file-tab')).toHaveLength(3)
        expect(screen.getByTestId('study-code-files-overflow')).toHaveTextContent('+2 more files')
    })

    it('the overflow count reflects the number of hidden files', async () => {
        const fixture = await setupFilesFixture(['main.R', 'a.R', 'b.R', 'c.R', 'd.R', 'e.R', 'f.R'])
        await renderSection(fixture)
        expect(screen.getByTestId('study-code-files-overflow')).toHaveTextContent('+4 more files')
    })

    it('opens a menu listing every hidden file when the overflow is clicked (OTTER-540)', async () => {
        const fixture = await setupFilesFixture(['main.R', 'a.R', 'b.R', 'c.R', 'd.R', 'e.R'])
        await renderSection(fixture)
        const user = userEvent.setup()

        // Hidden files are not in the document until the overflow menu is opened.
        expect(screen.queryAllByTestId('study-code-files-overflow-item')).toHaveLength(0)

        await user.click(screen.getByTestId('study-code-files-overflow'))

        const items = await screen.findAllByTestId('study-code-files-overflow-item')
        expect(items.map((item) => item.getAttribute('title'))).toEqual(['c.R', 'd.R', 'e.R'])
    })

    it('selecting a hidden file from the overflow menu makes it the active file (OTTER-540)', async () => {
        const fixture = await setupFilesFixture(['main.R', 'a.R', 'b.R', 'c.R', 'hidden-target.R'])
        await renderSection(fixture)
        const user = userEvent.setup()

        await user.click(screen.getByTestId('study-code-files-overflow'))
        await user.click(await screen.findByTitle('hidden-target.R'))

        // Reopen the menu; the chosen file is now marked as the selected entry.
        await user.click(screen.getByTestId('study-code-files-overflow'))
        const selected = await screen.findByTitle('hidden-target.R')
        expect(selected.getAttribute('data-selected')).toBe('true')
    })

    it('truncates long file names with an ellipsis and capping at ~22 chars', async () => {
        const longName = 'a-very-long-supplemental-code-filename.R'
        const fixture = await setupFilesFixture(['main.R', longName])
        await renderSection(fixture)
        const tabs = screen.getAllByTestId('study-code-file-tab')
        // The truncated tab keeps the original title attribute but the visible text is shorter.
        expect(tabs[1]).toHaveAttribute('title', longName)
        const visibleText = tabs[1].textContent ?? ''
        expect(visibleText.length).toBeLessThanOrEqual(22)
        expect(visibleText).toContain('…')
    })

    it('renders the study code body expanded by default and hides it when toggled', async () => {
        const fixture = await setupFilesFixture(['main.R'])
        await renderSection(fixture)
        await waitFor(() => expect(screen.getByTestId('study-code-body')).toBeInTheDocument())

        const user = userEvent.setup()
        const toggle = screen.getByTestId('study-code-toggle')
        expect(toggle).toHaveTextContent('Hide full study code')
        await user.click(toggle)

        expect(screen.queryByTestId('study-code-body')).not.toBeInTheDocument()
        expect(screen.queryByTestId('study-code-body-loading')).not.toBeInTheDocument()
        expect(toggle).toHaveTextContent('View full study code')

        await user.click(toggle)
        await waitFor(() => expect(screen.getByTestId('study-code-body')).toBeInTheDocument())
        expect(toggle).toHaveTextContent('Hide full study code')
    })

    it('hides the show/hide toggle when there are no code files', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture)
        expect(screen.queryByTestId('study-code-toggle')).not.toBeInTheDocument()
    })

    // OTTER-613: in whole-section collapse mode the parent owns expand/collapse. The code body is
    // always shown and the toggle becomes the section's "Hide full study code" closer.
    it('shows the code body up front and calls onCollapse from the closer toggle in onCollapse mode', async () => {
        const fixture = await setupFilesFixture(['main.R'])
        const [review, scan] = await Promise.all([
            getStudyReviewForJob(fixture.job.id),
            jobScanResultForJob(fixture.job.id),
        ])
        const onCollapse = vi.fn()
        renderWithProviders(
            <SubmittedCodeSection
                orgSlug={ORG_SLUG}
                study={fixture.study}
                job={fixture.job}
                review={review}
                scan={scan}
                onCollapse={onCollapse}
            />,
        )
        await waitFor(() => expect(screen.getByTestId('study-code-body')).toBeInTheDocument())

        const closer = screen.getByTestId('study-code-toggle-collapse')
        expect(closer).toHaveTextContent('Hide full study code')
        expect(screen.queryByTestId('study-code-toggle')).not.toBeInTheDocument()

        await userEvent.setup().click(closer)
        expect(onCollapse).toHaveBeenCalledTimes(1)
    })

    // The closer is the only collapse control in onCollapse mode, so it must remain reachable even
    // when there are no displayable code files — otherwise the section would be stuck expanded.
    it('keeps the closer toggle visible in onCollapse mode when there are no code files', async () => {
        const fixture = await setupBaseFixture()
        const [review, scan] = await Promise.all([
            getStudyReviewForJob(fixture.job.id),
            jobScanResultForJob(fixture.job.id),
        ])
        const onCollapse = vi.fn()
        renderWithProviders(
            <SubmittedCodeSection
                orgSlug={ORG_SLUG}
                study={fixture.study}
                job={fixture.job}
                review={review}
                scan={scan}
                onCollapse={onCollapse}
            />,
        )
        const closer = await screen.findByTestId('study-code-toggle-collapse')
        expect(closer).toHaveTextContent('Hide full study code')

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

    it('renders a download link on every visible file tab (OTTER-608)', async () => {
        const fixture = await setupFilesFixture(['main.R', 'helpers.R'])
        await renderSection(fixture)

        const mainDownload = await screen.findByRole('link', { name: 'Download main.R' })
        expect(mainDownload).toHaveAttribute('href', `/dl/study-code/${fixture.job.id}/main.R`)
        expect(mainDownload).toHaveAttribute('download', 'main.R')

        const helpersDownload = screen.getByRole('link', { name: 'Download helpers.R' })
        expect(helpersDownload).toHaveAttribute('href', `/dl/study-code/${fixture.job.id}/helpers.R`)
        expect(helpersDownload).toHaveAttribute('download', 'helpers.R')
    })

    it('exposes a download link for a file hidden in the overflow menu (OTTER-608)', async () => {
        const fixture = await setupFilesFixture(['main.R', 'a.R', 'b.R', 'c.R', 'hidden-target.R'])
        await renderSection(fixture)
        const user = userEvent.setup()

        await user.click(screen.getByTestId('study-code-files-overflow'))

        // The dropdown is portalled and renders display:none in the test DOM, so the link
        // isn't in the accessibility tree — query it by test id rather than by link role.
        const items = await screen.findAllByTestId('study-code-files-overflow-item')
        const hiddenItem = items.find((item) => item.getAttribute('title') === 'hidden-target.R')!
        const hiddenDownload = within(hiddenItem).getByTestId('study-code-download')
        expect(hiddenDownload).toHaveAttribute('href', `/dl/study-code/${fixture.job.id}/hidden-target.R`)
        expect(hiddenDownload).toHaveAttribute('download', 'hidden-target.R')
        expect(hiddenDownload).toHaveAttribute('aria-label', 'Download hidden-target.R')
    })

    it('downloading from the overflow menu does not switch the active file (OTTER-608)', async () => {
        const fixture = await setupFilesFixture(['main.R', 'a.R', 'b.R', 'c.R', 'hidden-target.R'])
        await renderSection(fixture)
        const user = userEvent.setup()

        await user.click(screen.getByTestId('study-code-files-overflow'))
        const items = await screen.findAllByTestId('study-code-files-overflow-item')
        const hiddenItem = items.find((item) => item.getAttribute('title') === 'hidden-target.R')!
        fireEvent.click(within(hiddenItem).getByTestId('study-code-download'))

        // The same Menu.Item onClick drives both the file-select and Mantine's
        // closeOnItemClick, and the icon's stopPropagation gates both — so the file
        // staying unselected also proves the dropdown was not closed.
        const after = screen
            .getAllByTestId('study-code-files-overflow-item')
            .find((item) => item.getAttribute('title') === 'hidden-target.R')
        expect(after).toHaveAttribute('data-selected', 'false')
    })
})

describe('SubmittedCodeSection — pure helpers', () => {
    it('truncateFileName leaves short names alone', () => {
        expect(truncateFileName('short.R')).toBe('short.R')
    })

    it('truncateFileName caps long names with an ellipsis', () => {
        const result = truncateFileName('a-very-long-supplemental-code-filename.R')
        expect(result.endsWith('…')).toBe(true)
        expect(result.length).toBeLessThanOrEqual(22)
    })

    it('splitVisibleFiles returns all files when count ≤ 4', () => {
        const files = ['m', 'a', 'b', 'c'].map((name) => ({ name, fileType: 'SUPPLEMENTAL-CODE' as const }))
        const { visible, hiddenCount } = splitVisibleFiles(files)
        expect(visible).toHaveLength(4)
        expect(hiddenCount).toBe(0)
    })

    it('splitVisibleFiles shows 3 tabs + overflow when count > 4', () => {
        const files = ['m', 'a', 'b', 'c', 'd', 'e'].map((name) => ({
            name,
            fileType: 'SUPPLEMENTAL-CODE' as const,
        }))
        const { visible, hidden, hiddenCount } = splitVisibleFiles(files)
        expect(visible.map((f) => f.name)).toEqual(['m', 'a', 'b'])
        expect(hidden.map((f) => f.name)).toEqual(['c', 'd', 'e'])
        expect(hiddenCount).toBe(3)
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
