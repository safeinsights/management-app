import { describe, expect, it, vi } from 'vitest'
import { useParams } from 'next/navigation'
import { memoryRouter } from 'next-router-mock'
import type { Route } from 'next'
import {
    actionResult,
    db,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { Routes } from '@/lib/routes'
import { getStudyAction, type CodeReviewFeedbackEntry, type SelectedStudy } from '@/server/actions/study.actions'
import { isSubmittedStudy, type Submitted } from '@/schema/study'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { CodePostDecisionView } from './code-post-decision-view'

vi.mock('@/server/storage', async () => {
    const actual = await vi.importActual<typeof import('@/server/storage')>('@/server/storage')
    return {
        ...actual,
        fetchFileContents: vi.fn(async () => new Blob(['print("hello from main.R")\n'])),
    }
})

// tests/vitest.setup.ts mocks PageBreadcrumbs to () => null. Re-mock with a vi.fn so we can
// inspect the crumbs prop without depending on the DOM render.
const mockPageBreadcrumbs = vi.fn()
vi.mock('@/components/page-breadcrumbs', () => ({
    OrgBreadcrumbs: () => null,
    ResearcherBreadcrumbs: () => null,
    PageBreadcrumbs: (props: { crumbs: Array<[string, string?]> }) => {
        mockPageBreadcrumbs(props)
        return null
    },
}))

const ORG_SLUG = 'openstax'
const REVIEWING_ORG_NAME = 'OpenStax Reviewers'
const DECISION_DATE = new Date('2026-04-02T10:00:00Z')

type DecisionStatus = 'CODE-APPROVED' | 'CODE-CHANGES-REQUESTED' | 'CODE-REJECTED'

const buildEntry = (overrides: Partial<CodeReviewFeedbackEntry> = {}): CodeReviewFeedbackEntry =>
    ({
        id: overrides.id ?? 'code-entry-1',
        authorId: overrides.authorId ?? 'author-1',
        authorName: overrides.authorName ?? 'Reviewer One',
        entryType: overrides.entryType ?? 'REVIEWER-FEEDBACK',
        decision: overrides.decision === undefined ? 'APPROVE' : overrides.decision,
        body: overrides.body ?? JSON.parse(lexicalJson('Reviewer comments go here.')),
        criteria: overrides.criteria ?? null,
        createdAt: overrides.createdAt ?? DECISION_DATE,
    }) as CodeReviewFeedbackEntry

async function setupDecidedStudy(decisionStatus: DecisionStatus, title = 'Effect of Reading Comprehension Tools') {
    const { org, user } = await mockSessionWithTestData({ orgSlug: ORG_SLUG, orgType: 'lab' })
    const { study: dbStudy, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: decisionStatus === 'CODE-APPROVED' ? 'APPROVED' : 'PENDING-REVIEW',
        jobStatus: 'CODE-SUBMITTED',
        title,
    })
    // Layer the decision row on top so it's the latest status change.
    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: job.id, status: decisionStatus, userId: user.id })
        .execute()

    await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: job.id,
            name: 'main.R',
            path: `${org.slug}/${dbStudy.id}/${job.id}/main.R`,
            fileType: 'MAIN-CODE',
        })
        .execute()

    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    if (!isSubmittedStudy(study)) throw new Error('test fixture must be a submitted study')
    const latestJob = (await latestJobForStudy(dbStudy.id)) as LatestJobForStudy
    ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: study.id })
    memoryRouter.setCurrentUrl('/')
    return { org, study, job: latestJob, latestJobStatus: decisionStatus }
}

const DEFAULT_DASHBOARD_HREF = Routes.orgDashboard({ orgSlug: ORG_SLUG })

function renderView(
    study: Submitted<SelectedStudy>,
    job: LatestJobForStudy,
    entries: CodeReviewFeedbackEntry[],
    latestJobStatus: DecisionStatus,
    overrides: { dashboardHref?: Route; reviewingOrgName?: string } = {},
) {
    renderWithProviders(
        <CodePostDecisionView
            orgSlug={ORG_SLUG}
            study={study}
            job={job}
            entries={entries}
            reviewingOrgName={overrides.reviewingOrgName ?? REVIEWING_ORG_NAME}
            dashboardHref={overrides.dashboardHref ?? DEFAULT_DASHBOARD_HREF}
            latestJobStatus={latestJobStatus}
        />,
    )
}

describe('CodePostDecisionView', () => {
    describe('breadcrumbs', () => {
        it('renders Dashboard / Study proposal (linked) / Study code (linkless)', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-APPROVED')
            renderView(study, job, [buildEntry({ decision: 'APPROVE' })], latestJobStatus)

            const lastCall = mockPageBreadcrumbs.mock.calls.at(-1)
            expect(lastCall).toBeDefined()
            const crumbs = lastCall![0].crumbs
            const expectedProposalHref = Routes.studySubmitted({ orgSlug: ORG_SLUG, studyId: study.id })
            expect(crumbs).toEqual([
                ['Dashboard', expect.any(String)],
                ['Study proposal', expectedProposalHref],
                ['Study code'],
            ])
        })
    })

    describe('header', () => {
        it('renders the page title, STEP 4 eyebrow, "Study code" section, and study title', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-APPROVED')
            renderView(study, job, [buildEntry({ decision: 'APPROVE' })], latestJobStatus)

            expect(screen.getByRole('heading', { level: 1, name: 'Study proposal' })).toBeInTheDocument()
            expect(screen.getByText('STEP 4')).toBeInTheDocument()
            expect(screen.getByRole('heading', { level: 4, name: 'Study code' })).toBeInTheDocument()
            expect(screen.getByText(/Title:\s*Effect of Reading Comprehension Tools/)).toBeInTheDocument()
        })

        it('renders "Approved on Apr 02, 2026" for CODE-APPROVED', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-APPROVED')
            renderView(study, job, [buildEntry({ decision: 'APPROVE', createdAt: DECISION_DATE })], latestJobStatus)

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Approved on Apr 02, 2026')
        })

        it('renders "Change requested on Apr 02, 2026" for CODE-CHANGES-REQUESTED', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-CHANGES-REQUESTED')
            renderView(
                study,
                job,
                [buildEntry({ decision: 'NEEDS-CLARIFICATION', createdAt: DECISION_DATE })],
                latestJobStatus,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Change requested on Apr 02, 2026')
        })

        it('renders "Rejected on Apr 02, 2026" for CODE-REJECTED', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-REJECTED')
            renderView(study, job, [buildEntry({ decision: 'REJECT', createdAt: DECISION_DATE })], latestJobStatus)

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Rejected on Apr 02, 2026')
        })
    })

    describe('decision banner', () => {
        it('renders the green code-approved banner with the reviewing org name', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-APPROVED')
            renderView(study, job, [buildEntry({ decision: 'APPROVE' })], latestJobStatus)

            const banner = screen.getByTestId('decision-banner-code-approved')
            expect(banner).toHaveTextContent(REVIEWING_ORG_NAME)
            expect(banner).toHaveTextContent(
                /has reviewed and approved your study code\. Your code will now proceed to run in the secure enclave\./,
            )
            expect(screen.queryByTestId('decision-banner-code-change-requested')).not.toBeInTheDocument()
            expect(screen.queryByTestId('decision-banner-code-rejected')).not.toBeInTheDocument()
        })

        it('renders the purple change-requested banner with the right copy', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-CHANGES-REQUESTED')
            renderView(study, job, [buildEntry({ decision: 'NEEDS-CLARIFICATION' })], latestJobStatus)

            const banner = screen.getByTestId('decision-banner-code-change-requested')
            expect(banner).toHaveTextContent(
                /has reviewed your code and has requested information and\/or changes\. Please review the feedback below\. You can update your code and resubmit it to address their comments\./,
            )
            expect(screen.queryByTestId('decision-banner-code-approved')).not.toBeInTheDocument()
        })

        it('renders the red code-rejected banner with the right copy', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-REJECTED')
            renderView(study, job, [buildEntry({ decision: 'REJECT' })], latestJobStatus)

            const banner = screen.getByTestId('decision-banner-code-rejected')
            expect(banner).toHaveTextContent(
                /has determined this code does not meet the requirements to proceed\. Please review their feedback below\./,
            )
            expect(banner).toHaveTextContent(/If you believe this decision was made in error, contact SafeInsights\./)
            expect(screen.queryByTestId('decision-banner-code-approved')).not.toBeInTheDocument()
        })
    })

    describe('study code viewer', () => {
        it('starts collapsed and toggles to "Hide submitted study code" with body visible', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-APPROVED')
            renderView(study, job, [buildEntry({ decision: 'APPROVE' })], latestJobStatus)

            expect(screen.getByTestId('study-code-viewer')).toBeInTheDocument()
            expect(screen.queryByTestId('study-code-body')).not.toBeInTheDocument()

            const toggle = screen.getByTestId('study-code-toggle')
            expect(toggle).toHaveTextContent('View submitted study code')

            const interact = userEvent.setup()
            await interact.click(toggle)

            await waitFor(() => expect(screen.getByTestId('study-code-body')).toBeInTheDocument())
            expect(toggle).toHaveTextContent('Hide submitted study code')
        })
    })

    describe('feedback and notes', () => {
        it('expands the latest entry and collapses prior entries', async () => {
            const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
            try {
                const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-CHANGES-REQUESTED')
                const latest = buildEntry({
                    id: 'latest-entry',
                    decision: 'NEEDS-CLARIFICATION',
                    createdAt: new Date('2026-04-20T10:00:00Z'),
                })
                const prior = buildEntry({
                    id: 'prior-entry',
                    entryType: 'REVIEWER-FEEDBACK',
                    decision: 'APPROVE',
                    createdAt: new Date('2026-04-10T10:00:00Z'),
                })

                renderView(study, job, [latest, prior], latestJobStatus)

                expect(screen.getByTestId('feedback-toggle-latest-entry')).toHaveAttribute('aria-expanded', 'true')
                expect(screen.getByTestId('feedback-toggle-prior-entry')).toHaveAttribute('aria-expanded', 'false')
            } finally {
                scrollHeightSpy.mockRestore()
            }
        })
    })

    describe('navigation', () => {
        it('renders a "Previous step" link to studyAgreements?from=previous in all decisions', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-APPROVED')
            renderView(study, job, [buildEntry({ decision: 'APPROVE' })], latestJobStatus)

            const previous = screen.getByRole('link', { name: /previous step/i })
            expect(previous).toHaveAttribute(
                'href',
                expect.stringContaining(`/${ORG_SLUG}/study/${study.id}/agreements?from=previous`),
            )
        })

        it('renders "Go to dashboard" for CODE-APPROVED', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-APPROVED')
            renderView(study, job, [buildEntry({ decision: 'APPROVE' })], latestJobStatus)

            const dashboard = screen.getByTestId('cta-go-to-dashboard')
            expect(dashboard).toHaveTextContent('Go to dashboard')
            expect(dashboard).toHaveAttribute('href', `/${ORG_SLUG}/dashboard`)
            expect(screen.queryByTestId('cta-edit-and-resubmit')).not.toBeInTheDocument()
        })

        it('renders "Go to dashboard" for CODE-REJECTED', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-REJECTED')
            renderView(study, job, [buildEntry({ decision: 'REJECT' })], latestJobStatus)

            const dashboard = screen.getByTestId('cta-go-to-dashboard')
            expect(dashboard).toHaveTextContent('Go to dashboard')
            expect(dashboard).toHaveAttribute('href', `/${ORG_SLUG}/dashboard`)
            expect(screen.queryByTestId('cta-edit-and-resubmit')).not.toBeInTheDocument()
        })

        it('renders "Edit and resubmit" pointing at the resubmit route for CODE-CHANGES-REQUESTED', async () => {
            const { study, job, latestJobStatus } = await setupDecidedStudy('CODE-CHANGES-REQUESTED')
            renderView(study, job, [buildEntry({ decision: 'NEEDS-CLARIFICATION' })], latestJobStatus)

            const resubmit = screen.getByTestId('cta-edit-and-resubmit')
            expect(resubmit).toHaveTextContent('Edit and resubmit')
            expect(resubmit).toHaveAttribute('href', `/${ORG_SLUG}/study/${study.id}/resubmit`)
            expect(screen.queryByTestId('cta-go-to-dashboard')).not.toBeInTheDocument()
        })
    })
})
