import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    db,
    insertTestDataSource,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    type Mock,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    getStudyReviewForJob,
    jobScanResultForJob,
    latestJobForStudy,
    type LatestJobForStudy,
} from '@/server/db/queries'
import { fetchFileContents } from '@/server/storage'
import { SubmittedCodeSection } from './submitted-code-section'
import { splitVisibleFiles, truncateFileName } from './submitted-code-interactive'

vi.mock('@/server/storage', () => ({ fetchFileContents: vi.fn() }))

function mockScanLogContents(contents: string) {
    ;(fetchFileContents as Mock).mockResolvedValueOnce(new Blob([contents]))
}

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

async function renderSection(fixture: Fixture) {
    const [review, scan] = await Promise.all([
        getStudyReviewForJob(fixture.job.id),
        jobScanResultForJob(fixture.job.id),
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

    it('renders "View approved initial request" link that opens the post-proposal feedback page in a new tab', async () => {
        await renderSection(fixture)
        const link = screen.getByTestId('view-approved-initial-request')
        expect(link).toHaveTextContent('View approved initial request')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
        expect(link).toHaveAttribute('href', `/${ORG_SLUG}/study/${fixture.study.id}/review?from=code-review`)
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

    it('renders the toggle with "View full AI summary" by default and the body is collapsed', async () => {
        await renderSection(fixture)
        expect(screen.getByTestId('ai-summary-toggle')).toHaveTextContent('View full AI summary')
        expect(screen.queryByTestId('ai-summary-body')).not.toBeInTheDocument()
    })

    it('expands the body and flips the toggle label when clicked', async () => {
        await renderSection(fixture)
        const user = userEvent.setup()
        await user.click(screen.getByTestId('ai-summary-toggle'))

        expect(screen.getByTestId('ai-summary-body')).toHaveTextContent(SUMMARY_TEXT)
        expect(screen.getByTestId('ai-summary-toggle')).toHaveTextContent('Hide full AI summary')
    })

    it('collapses the body again when the toggle is clicked twice', async () => {
        await renderSection(fixture)
        const user = userEvent.setup()
        const toggle = screen.getByTestId('ai-summary-toggle')
        await user.click(toggle)
        await user.click(toggle)

        expect(screen.queryByTestId('ai-summary-body')).not.toBeInTheDocument()
        expect(toggle).toHaveTextContent('View full AI summary')
    })

    it('falls back to an empty-state when no review report exists yet', async () => {
        const noReviewFixture = await setupBaseFixture()
        await renderSection(noReviewFixture)
        expect(screen.getByTestId('ai-summary-empty')).toHaveTextContent('No AI summary available yet.')
        expect(screen.queryByTestId('ai-summary-toggle')).not.toBeInTheDocument()
    })
})

describe('SubmittedCodeSection — Security scan log', () => {
    it('renders section title "Security scan log"', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture)
        expect(screen.getByTestId('security-scan-log')).toHaveTextContent('Security scan log')
    })

    it('renders the scan log file name when a log is attached', async () => {
        const fixture = await setupBaseFixture()
        await insertStudyJobFile(fixture.job.id, 'security-scan.log', 'ENCRYPTED-SECURITY-SCAN-LOG')
        mockScanLogContents('Scan summary: OK')
        await renderSection(fixture)
        expect(screen.getByTestId('security-scan-log-file')).toHaveTextContent('security-scan.log')
    })

    it('shows an in-progress indicator when no scan log exists yet', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture)
        expect(screen.getByTestId('security-scan-log-pending')).toHaveTextContent('Scan in progress')
        const icon = screen.getByTestId('security-scan-log').querySelector('[data-icon]')
        expect(icon?.getAttribute('data-icon')).toBe('in-progress')
    })

    it("displays a green icon when the log contents contain 'OK'", async () => {
        const fixture = await setupBaseFixture()
        await insertStudyJobFile(fixture.job.id, 'security-scan.log', 'ENCRYPTED-SECURITY-SCAN-LOG')
        mockScanLogContents('Trivy: 0 vulnerabilities found\nQuality Gate: OK')
        await renderSection(fixture)
        const icon = screen.getByTestId('security-scan-log').querySelector('[data-icon]')
        expect(icon?.getAttribute('data-icon')).toBe('pass')
    })

    it("displays a red icon when the log contents do not contain 'OK'", async () => {
        const fixture = await setupBaseFixture()
        await insertStudyJobFile(fixture.job.id, 'security-scan.log', 'ENCRYPTED-SECURITY-SCAN-LOG')
        mockScanLogContents('CRITICAL: vulnerability detected')
        await renderSection(fixture)
        const icon = screen.getByTestId('security-scan-log').querySelector('[data-icon]')
        expect(icon?.getAttribute('data-icon')).toBe('fail')
    })

    it('falls back to in-progress when the log file is unreadable', async () => {
        const fixture = await setupBaseFixture()
        await insertStudyJobFile(fixture.job.id, 'security-scan.log', 'ENCRYPTED-SECURITY-SCAN-LOG')
        ;(fetchFileContents as Mock).mockRejectedValueOnce(new Error('not found'))
        await renderSection(fixture)
        const icon = screen.getByTestId('security-scan-log').querySelector('[data-icon]')
        expect(icon?.getAttribute('data-icon')).toBe('in-progress')
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
        expect(screen.getByTestId('study-code-body')).toBeInTheDocument()

        const user = userEvent.setup()
        const toggle = screen.getByTestId('study-code-toggle')
        expect(toggle).toHaveTextContent('Hide full study code')
        await user.click(toggle)

        expect(screen.queryByTestId('study-code-body')).not.toBeInTheDocument()
        expect(toggle).toHaveTextContent('View full study code')

        await user.click(toggle)
        expect(screen.getByTestId('study-code-body')).toBeInTheDocument()
        expect(toggle).toHaveTextContent('Hide full study code')
    })

    it('hides the show/hide toggle when there are no code files', async () => {
        const fixture = await setupBaseFixture()
        await renderSection(fixture)
        expect(screen.queryByTestId('study-code-toggle')).not.toBeInTheDocument()
    })

    it('renders a visible "preview coming soon" hint inside the placeholder body', async () => {
        const fixture = await setupFilesFixture(['main.R'])
        await renderSection(fixture)
        const body = screen.getByTestId('study-code-body')
        expect(body).toHaveTextContent('Code preview coming soon')
        expect(body).toHaveTextContent('main.R')
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
        const { visible, hiddenCount } = splitVisibleFiles(files)
        expect(visible.map((f) => f.name)).toEqual(['m', 'a', 'b'])
        expect(hiddenCount).toBe(3)
    })
})
