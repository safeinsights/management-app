import { lexicalJson } from '@/lib/word-count'
import { getStudyAction, type ProposalFeedbackEntry, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    type Mock,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { memoryRouter } from 'next-router-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { PostFeedbackView } from './post-feedback-view'

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
            const entries = [buildEntry({ decision: 'APPROVE', createdAt: new Date('2026-04-16T10:00:00Z') })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            expect(screen.getByTestId('decision-timestamp')).toHaveTextContent('Approved on Apr 16, 2026')
        })

        it('renders "Clarification requested on {date}" for needs-clarification', () => {
            const entries = [
                buildEntry({ decision: 'NEEDS-CLARIFICATION', createdAt: new Date('2026-04-16T10:00:00Z') }),
            ]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            expect(screen.getByTestId('decision-timestamp')).toHaveTextContent(
                'Clarification requested on Apr 16, 2026',
            )
        })

        it('renders "Rejected on {date}" for reject decision', () => {
            const entries = [buildEntry({ decision: 'REJECT', createdAt: new Date('2026-04-16T10:00:00Z') })]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            expect(screen.getByTestId('decision-timestamp')).toHaveTextContent('Rejected on Apr 16, 2026')
        })

        it('renders the page title and study title', () => {
            const entries = [buildEntry()]
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={entries} />)

            expect(screen.getByRole('heading', { name: 'Study Proposal', level: 1 })).toBeInTheDocument()
            // "Review initial request" appears twice — once as the page subtitle and once as the
            // ProposalSection's heading inside the (collapsed) dropdown. Both are expected.
            expect(screen.getAllByText('Review initial request').length).toBeGreaterThan(0)
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

            // ProposalSection's collapsed-state toggle says "Show full initial request"
            expect(screen.getByTestId('proposal-toggle-header')).toHaveTextContent('Show full initial request')
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
        })

        const researcherEntry = buildEntry({
            id: 'researcher-1',
            authorRole: 'RESEARCHER',
            entryType: 'RESUBMISSION-NOTE',
            authorName: 'Dr. Researcher',
            decision: null,
            createdAt: new Date('2026-04-18T08:00:00Z'),
            body: JSON.parse(lexicalJson('Original resubmission note.')),
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
            renderWithProviders(
                <PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry, researcherEntry]} />,
            )

            expect(screen.getByTestId('feedback-toggle-reviewer-1')).toHaveAttribute('aria-expanded', 'true')
            expect(screen.getByTestId('feedback-toggle-researcher-1')).toHaveAttribute('aria-expanded', 'false')
        })

        it('titles reviewer entries "Reviewer feedback"', () => {
            renderWithProviders(<PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry]} />)

            const entry = screen.getByTestId('feedback-entry-reviewer-1')
            expect(entry).toHaveTextContent('Reviewer feedback')
        })

        it('titles researcher entries "Resubmission note"', () => {
            // Include a reviewer entry first so the view's decision header can render —
            // PostFeedbackView returns null when the latest entry has no decision.
            renderWithProviders(
                <PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry, researcherEntry]} />,
            )

            const entry = screen.getByTestId('feedback-entry-researcher-1')
            expect(entry).toHaveTextContent('Resubmission note')
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

        it('toggles entry expansion on caret click', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <PostFeedbackView orgSlug={ORG_SLUG} study={study} entries={[reviewerEntry, researcherEntry]} />,
            )

            const olderToggle = screen.getByTestId('feedback-toggle-researcher-1')
            expect(olderToggle).toHaveAttribute('aria-expanded', 'false')
            await user.click(olderToggle)
            expect(olderToggle).toHaveAttribute('aria-expanded', 'true')
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
})
