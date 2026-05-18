import { lexicalJson } from '@/lib/lexical'
import { Routes } from '@/lib/routes'
import {
    getStudyAction,
    type CodeReviewFeedbackEntry,
    type ProposalFeedbackEntry,
    type SelectedStudy,
} from '@/server/actions/study.actions'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
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
import { useParams } from 'next/navigation'
import { memoryRouter } from 'next-router-mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostFeedbackView } from './post-feedback-view'

vi.mock('@/server/storage', async () => {
    const actual = await vi.importActual<typeof import('@/server/storage')>('@/server/storage')
    return {
        ...actual,
        fetchFileContents: vi.fn(async () => new Blob(['print("hello from main.R")\n'])),
    }
})

// tests/vitest.setup.ts mocks PageBreadcrumbs to () => null. Re-mock with a vi.fn so we can
// inspect the crumbs prop without depending on the DOM render. The arrow wrapper survives
// vitest's per-test mockReset (which would otherwise wipe the impl on a bare vi.fn).
const mockPageBreadcrumbs = vi.fn()
vi.mock('@/components/page-breadcrumbs', () => ({
    OrgBreadcrumbs: () => null,
    ResearcherBreadcrumbs: () => null,
    PageBreadcrumbs: (props: { crumbs: Array<[string, string?]> }) => {
        mockPageBreadcrumbs(props)
        return null
    },
}))

const ORG_SLUG = 'test-org'

const buildEntry = (overrides: Partial<ProposalFeedbackEntry> = {}): ProposalFeedbackEntry =>
    ({
        id: overrides.id ?? 'entry-1',
        authorId: overrides.authorId ?? 'author-1',
        authorName: overrides.authorName ?? 'Reviewer One',
        authorRole: overrides.authorRole ?? 'REVIEWER',
        entryType: overrides.entryType ?? 'REVIEWER-FEEDBACK',
        decision: overrides.decision === undefined ? 'APPROVE' : overrides.decision,
        body: overrides.body ?? JSON.parse(lexicalJson('This is the reviewer feedback body.')),
        createdAt: overrides.createdAt ?? new Date('2026-04-16T10:00:00Z'),
        version: overrides.version ?? null,
    }) as ProposalFeedbackEntry

describe('PostFeedbackView', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: ORG_SLUG, orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'Effect of Reading Comprehension Tools',
        })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: study.id })
        memoryRouter.setCurrentUrl('/')
    })

    describe('decision header', () => {
        it('renders "Approved on {date}" timestamp for approve decision', () => {
            const approvedStudy = {
                ...study,
                status: 'APPROVED' as const,
                approvedAt: new Date('2026-04-20T10:00:00Z'),
            }
            const entries = [buildEntry({ decision: 'APPROVE', createdAt: new Date('2026-04-16T10:00:00Z') })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={approvedStudy} entries={entries} />)

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Approved on Apr 20, 2026')
        })

        it('renders "Clarification requested on {date}" for needs-clarification', () => {
            const changeRequestedStudy = { ...study, status: 'CHANGE-REQUESTED' as const }
            const entries = [
                buildEntry({ decision: 'NEEDS-CLARIFICATION', createdAt: new Date('2026-04-18T10:00:00Z') }),
            ]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={changeRequestedStudy} entries={entries} />)

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent(
                'Clarification requested on Apr 18, 2026',
            )
        })

        it('renders "Rejected on {date}" for reject decision', () => {
            const rejectedStudy = {
                ...study,
                status: 'REJECTED' as const,
                rejectedAt: new Date('2026-05-01T10:00:00Z'),
            }
            const entries = [buildEntry({ decision: 'REJECT', createdAt: new Date('2026-04-16T10:00:00Z') })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={rejectedStudy} entries={entries} />)

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Rejected on May 01, 2026')
        })

        it('renders the page title and study title', () => {
            const entries = [buildEntry()]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            expect(screen.getByRole('heading', { name: 'Study proposal', level: 1 })).toBeInTheDocument()
            expect(screen.getByText('Review initial request')).toBeInTheDocument()
            expect(screen.getByText(/Effect of Reading Comprehension Tools/)).toBeInTheDocument()
        })
    })

    describe('decision banner', () => {
        it('renders the approved banner with the expected copy', () => {
            const entries = [buildEntry({ decision: 'APPROVE' })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            const banner = screen.getByTestId('decision-banner-approved')
            expect(banner).toHaveTextContent(
                "This initial request has been approved. You'll receive email notifications when the researcher proceeds to the next step.",
            )
        })

        it('renders the clarification banner with the expected copy', () => {
            const entries = [buildEntry({ decision: 'NEEDS-CLARIFICATION' })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            const banner = screen.getByTestId('decision-banner-clarification')
            expect(banner).toHaveTextContent(
                'You have requested clarification. The researcher has been notified, and we will inform you once they resubmit.',
            )
        })

        it('renders the rejected banner with the expected copy', () => {
            const entries = [buildEntry({ decision: 'REJECT' })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            const banner = screen.getByTestId('decision-banner-rejected')
            expect(banner).toHaveTextContent(
                'This initial request has been rejected. No further action is required at this time.',
            )
        })

        it('renders only one banner at a time', () => {
            const entries = [buildEntry({ decision: 'APPROVE' })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            expect(screen.getByTestId('decision-banner-approved')).toBeInTheDocument()
            expect(screen.queryByTestId('decision-banner-clarification')).not.toBeInTheDocument()
            expect(screen.queryByTestId('decision-banner-rejected')).not.toBeInTheDocument()
        })
    })

    describe('full initial request dropdown', () => {
        it('renders the proposal section collapsed by default', () => {
            const entries = [buildEntry()]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            expect(screen.getByTestId('proposal-toggle-header')).toHaveTextContent('View full initial request')
        })
    })

    describe('feedback and notes', () => {
        const reviewerEntry = buildEntry({
            id: 'reviewer-1',
            authorRole: 'REVIEWER',
            entryType: 'REVIEWER-FEEDBACK',
            authorName: 'Dr. Reviewer',
            decision: 'NEEDS-CLARIFICATION',
            createdAt: new Date('2026-04-20T12:00:00Z'),
            body: JSON.parse(lexicalJson('Latest reviewer note.')),
            version: 2,
        })

        const researcherEntry = buildEntry({
            id: 'researcher-1',
            authorRole: 'RESEARCHER',
            entryType: 'RESUBMISSION-NOTE',
            authorName: 'Dr. Researcher',
            decision: null,
            createdAt: new Date('2026-04-18T08:00:00Z'),
            body: JSON.parse(lexicalJson('Original resubmission note.')),
            version: 2,
        })

        it('orders entries from most recent to oldest', () => {
            renderWithProviders(
                <PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry, researcherEntry]} />,
            )

            const entries = screen.getByTestId('feedback-entries')
            const titles = entries.querySelectorAll('[data-testid^="feedback-entry-"]')
            // Latest first
            expect(titles[0]).toHaveAttribute('data-testid', 'feedback-entry-reviewer-1')
            expect(titles[1]).toHaveAttribute('data-testid', 'feedback-entry-researcher-1')
        })

        it('expands the latest entry by default and collapses older entries', () => {
            const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
            try {
                renderWithProviders(
                    <PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry, researcherEntry]} />,
                )

                expect(screen.getByTestId('feedback-toggle-reviewer-1')).toHaveAttribute('aria-expanded', 'true')
                expect(screen.getByTestId('feedback-toggle-researcher-1')).toHaveAttribute('aria-expanded', 'false')
            } finally {
                scrollHeightSpy.mockRestore()
            }
        })

        it('titles entries with their stored version', () => {
            renderWithProviders(
                <PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry, researcherEntry]} />,
            )

            expect(screen.getByTestId('feedback-entry-reviewer-1')).toHaveTextContent('Reviewer feedback (v2.0)')
            expect(screen.getByTestId('feedback-entry-researcher-1')).toHaveTextContent('Resubmission note (v2.0)')
        })

        it('renders author name and date for each entry', () => {
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry]} />)

            const entry = screen.getByTestId('feedback-entry-reviewer-1')
            expect(entry).toHaveTextContent('Dr. Reviewer')
            expect(entry).toHaveTextContent('Apr 20, 2026')
        })

        it('renders a divider between entries when there are multiple', () => {
            renderWithProviders(
                <PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry, researcherEntry]} />,
            )

            expect(screen.getAllByTestId('entry-divider')).toHaveLength(1)
        })

        it('does not render a divider when there is only one entry', () => {
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry]} />)

            expect(screen.queryByTestId('entry-divider')).not.toBeInTheDocument()
        })

        it('toggles entry expansion on click', async () => {
            // happy-dom doesn't compute real layout, so scrollHeight ≈ clientHeight and
            // isTruncated stays false. Mock a large scrollHeight so the toggle renders.
            const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
            try {
                const user = userEvent.setup()
                renderWithProviders(
                    <PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry, researcherEntry]} />,
                )

                const toggle = screen.getByTestId('feedback-toggle-reviewer-1')
                expect(toggle).toHaveAttribute('aria-expanded', 'true')

                await user.click(toggle)
                expect(toggle).toHaveAttribute('aria-expanded', 'false')
            } finally {
                scrollHeightSpy.mockRestore()
            }
        })
    })

    describe('navigation', () => {
        it('navigates to the personal dashboard when "Go to dashboard" is clicked', async () => {
            const user = userEvent.setup()
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[buildEntry()]} />)

            await user.click(screen.getByRole('button', { name: 'Go to dashboard' }))
            expect(memoryRouter.asPath).toBe('/dashboard')
        })
    })

    describe('kind="CODE"', () => {
        const buildCodeEntry = (overrides: Partial<CodeReviewFeedbackEntry> = {}): CodeReviewFeedbackEntry =>
            ({
                id: overrides.id ?? 'code-entry-1',
                authorId: overrides.authorId ?? 'author-1',
                authorName: overrides.authorName ?? 'Reviewer One',
                entryType: overrides.entryType ?? 'DECISION',
                decision: overrides.decision === undefined ? 'APPROVE' : overrides.decision,
                body: overrides.body ?? JSON.parse(lexicalJson('Code looks good.')),
                criteria: overrides.criteria ?? null,
                createdAt: overrides.createdAt ?? new Date('2026-04-16T10:00:00Z'),
            }) as CodeReviewFeedbackEntry

        it('renders the STEP 3 label and "Review study code" heading', () => {
            const entries = [buildCodeEntry({ decision: 'APPROVE' })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} kind="CODE" />)

            expect(screen.getByText('STEP 3')).toBeInTheDocument()
            expect(screen.getByText('Review study code')).toBeInTheDocument()
        })

        it('renders the code-approved banner with code-review-specific copy', () => {
            const entries = [buildCodeEntry({ decision: 'APPROVE' })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} kind="CODE" />)

            const banner = screen.getByTestId('decision-banner-code-approved')
            expect(banner).toHaveTextContent(
                'This study code has been approved. You will be notified when the study results are available for review.',
            )
            expect(screen.queryByTestId('decision-banner-approved')).not.toBeInTheDocument()
        })

        it('renders the code-rejected banner with code-review-specific copy', () => {
            const entries = [buildCodeEntry({ decision: 'REJECT' })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} kind="CODE" />)

            const banner = screen.getByTestId('decision-banner-code-rejected')
            expect(banner).toHaveTextContent(
                'This study code was rejected and the study was ended. No further action is required at this time.',
            )
            expect(screen.queryByTestId('decision-banner-rejected')).not.toBeInTheDocument()
        })

        it('renders the change-requested banner with the right copy and yellow background', () => {
            const entries = [buildCodeEntry({ decision: 'NEEDS-CLARIFICATION' })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} kind="CODE" />)

            const banner = screen.getByTestId('decision-banner-code-change-requested')
            expect(banner).toHaveTextContent(
                'You have requested changes or more information about the study code. The researcher has been notified, and you will be notified once they resubmit.',
            )
            // Proposal-only clarification banner must NOT appear under kind=CODE.
            expect(screen.queryByTestId('decision-banner-clarification')).not.toBeInTheDocument()
        })

        it('uses "Change requested on" timestamp prefix for NEEDS-CLARIFICATION', () => {
            const entries = [
                buildCodeEntry({ decision: 'NEEDS-CLARIFICATION', createdAt: new Date('2026-04-18T10:00:00Z') }),
            ]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} kind="CODE" />)

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Change requested on Apr 18, 2026')
        })

        it('uses "Review study code" crumb (not "Review initial request") for kind=CODE', () => {
            const entries = [buildCodeEntry()]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} kind="CODE" />)

            // Proposal-only label should not appear under kind=CODE.
            expect(screen.queryByText('Review initial request')).not.toBeInTheDocument()
        })

        it('renders the "Study proposal" breadcrumb as a link to the proposal post-feedback page for kind=CODE', () => {
            // PageBreadcrumbs is mocked to () => null in tests/vitest.setup.ts so we assert
            // on the crumbs array passed to it instead of DOM-querying the link.
            const entries = [buildCodeEntry({ decision: 'APPROVE' })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} kind="CODE" />)

            const expectedHref = Routes.studySubmitted({ orgSlug: ORG_SLUG, studyId: study.id })
            const lastCall = mockPageBreadcrumbs.mock.calls.at(-1)
            expect(lastCall).toBeDefined()
            const crumbs = lastCall![0].crumbs
            expect(crumbs).toEqual([
                ['Dashboard', expect.any(String)],
                ['Study proposal', expectedHref],
                ['Review study code'],
            ])
        })

        it('renders the "Study proposal" breadcrumb as plain text (not a link) for kind=PROPOSAL', () => {
            // The PROPOSAL crumb is linkless because it would otherwise be a self-link to
            // the page the user is already on.
            const entries = [buildEntry({ decision: 'APPROVE' })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            const lastCall = mockPageBreadcrumbs.mock.calls.at(-1)
            expect(lastCall).toBeDefined()
            const crumbs = lastCall![0].crumbs
            expect(crumbs).toEqual([['Dashboard', expect.any(String)], ['Study proposal'], ['Review initial request']])
        })

        it('renders the StudyCodeViewer collapsed by default when a job is provided', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: ORG_SLUG, orgType: 'enclave' })
            const { study: dbStudy, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await db
                .insertInto('studyJobFile')
                .values({
                    studyJobId: job.id,
                    name: 'main.R',
                    path: `studies/${job.id}/main.R`,
                    fileType: 'MAIN-CODE',
                })
                .execute()
            const codeStudy = actionResult(await getStudyAction({ studyId: dbStudy.id }))
            const latestJob: LatestJobForStudy = await latestJobForStudy(codeStudy.id)
            ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: codeStudy.id })

            const entries = [buildCodeEntry({ decision: 'APPROVE' })]
            renderWithProviders(
                <PostFeedbackView orgSlug={ORG_SLUG} study={codeStudy} entries={entries} kind="CODE" job={latestJob} />,
            )

            // The viewer container is rendered, but the code body is hidden until the toggle is clicked.
            expect(screen.getByTestId('study-code-viewer')).toBeInTheDocument()
            expect(screen.queryByTestId('study-code-body')).not.toBeInTheDocument()
            const toggle = screen.getByTestId('study-code-toggle')
            expect(toggle).toHaveTextContent('View full study code')

            const userClick = userEvent.setup()
            await userClick.click(toggle)
            await waitFor(() => expect(screen.getByTestId('study-code-body')).toBeInTheDocument())
            expect(toggle).toHaveTextContent('Hide full study code')
        })
    })
})
