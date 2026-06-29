import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { isSubmittedStudy, type Submitted } from '@/schema/study'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    type Mock,
} from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { memoryRouter } from 'next-router-mock'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it } from 'vitest'
import { ReviewConfirmationModal, REJECTION_WARNING } from '@/components/modals/review-confirmation-modal'
import { ProposalReviewView } from './proposal-review-view'

describe('ProposalReviewView', () => {
    let study: Submitted<SelectedStudy>

    beforeEach(async () => {
        memoryRouter.setCurrentUrl('/')
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'Test Study Title',
        })
        const loaded = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        if (!isSubmittedStudy(loaded)) throw new Error('test fixture must be a submitted study')
        study = loaded
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'test-org', studyId: study.id })
    })

    it('renders all sections', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />)

        expect(screen.getByTestId('proposal-section')).toBeInTheDocument()
        expect(screen.getByTestId('review-feedback-section')).toBeInTheDocument()
        expect(screen.getByTestId('review-decision-section')).toBeInTheDocument()
    })

    it('renders the page title', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />)

        expect(screen.getByRole('heading', { name: 'Review initial request', level: 1 })).toBeInTheDocument()
    })

    it('renders the study title in proposal section', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />)

        expect(screen.getByText(/Test Study Title/)).toBeInTheDocument()
    })

    it('renders the back button', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />)

        expect(screen.getByRole('button', { name: /Back/ })).toBeInTheDocument()
    })

    it('renders submit review as disabled initially', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />)

        expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled()
    })

    describe('needs-clarification', () => {
        it('renders the needs-clarification option as selectable', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            const needsClarification = screen.getByRole('radio', { name: /Needs clarification/ })
            expect(needsClarification).not.toBeDisabled()

            await user.click(needsClarification)
            expect(needsClarification).toBeChecked()
        })

        it('keeps submit disabled when needs-clarification is selected without valid feedback', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            await user.click(screen.getByRole('radio', { name: /Needs clarification/ }))

            expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled()
        })
    })

    // Submit-wiring coverage (approve/needs-clarification/reject → mutation call with right decision + feedback)
    // lives in server/actions/study.actions.test.ts. The UI path will be covered here once OTTER-491
    // replaces the feedback <Skeleton> with a real editor that tests can type into.

    describe('round-N history (prior entries)', () => {
        it('does not render the feedback-and-notes section when there is no prior history', () => {
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            expect(screen.queryByTestId('feedback-and-notes-section')).not.toBeInTheDocument()
        })

        it('renders prior entries as read-only history above the editor when reviewVersion > 1', () => {
            const priorEntries = [
                {
                    id: 'entry-1',
                    authorId: 'user-1',
                    authorRole: 'REVIEWER',
                    entryType: 'REVIEWER-FEEDBACK',
                    decision: 'NEEDS-CLARIFICATION',
                    body: JSON.parse(lexicalJson('Round 1 reviewer feedback body.')),
                    createdAt: new Date('2026-05-01'),
                    version: 1,
                    authorName: 'Alice Reviewer',
                },
                {
                    id: 'entry-2',
                    authorId: 'user-2',
                    authorRole: 'RESEARCHER',
                    entryType: 'RESUBMISSION-NOTE',
                    decision: null,
                    body: JSON.parse(lexicalJson('Researcher resubmission note.')),
                    createdAt: new Date('2026-05-05'),
                    version: 2,
                    authorName: 'Bob Researcher',
                },
            ] as unknown as React.ComponentProps<typeof ProposalReviewView>['priorEntries']

            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={priorEntries} reviewVersion={2} />,
            )

            expect(screen.getByTestId('feedback-and-notes-section')).toBeInTheDocument()
            // Round-aware heading on the editable section
            expect(screen.getByText('Round 2 review')).toBeInTheDocument()
        })
    })

    describe('ReviewConfirmationModal copy', () => {
        it('renders the reject modal with the new title and both paragraphs', () => {
            renderWithProviders(
                <ReviewConfirmationModal
                    isOpen
                    onClose={() => {}}
                    onConfirm={() => {}}
                    isPending={false}
                    title="Reject initial request"
                    confirmLabel="Reject initial request"
                    variant="destructive"
                >
                    <span>
                        Please confirm you are ready to submit your review. Further edits are not permitted once
                        submitted.
                    </span>
                    {REJECTION_WARNING}
                </ReviewConfirmationModal>,
            )

            const dialog = screen.getByRole('dialog')
            expect(dialog).toHaveTextContent('Reject initial request')
            expect(dialog).toHaveTextContent(
                'Please confirm you are ready to submit your review. Further edits are not permitted once submitted.',
            )
            expect(dialog).toHaveTextContent(
                'Rejection: This is intended as a last resort due to major, unresolvable issues and will end this study. This action cannot be undone.',
            )
            expect(dialog.textContent ?? '').not.toContain('Other teammates')
        })

        it('renders the approve/needs-clarification modal with the shared body and no rejection warning', () => {
            renderWithProviders(
                <ReviewConfirmationModal
                    isOpen
                    onClose={() => {}}
                    onConfirm={() => {}}
                    isPending={false}
                    title="Confirm review submission?"
                    confirmLabel="Yes, submit review"
                >
                    <span>
                        Please confirm you are ready to submit your review. Further edits are not permitted once
                        submitted.
                    </span>
                </ReviewConfirmationModal>,
            )

            const dialog = screen.getByRole('dialog')
            expect(dialog).toHaveTextContent('Confirm review submission?')
            expect(dialog).toHaveTextContent(
                'Please confirm you are ready to submit your review. Further edits are not permitted once submitted.',
            )
            expect(dialog.textContent ?? '').not.toContain('Rejection:')
            expect(dialog.textContent ?? '').not.toContain('Other teammates')
        })
    })

    describe('already-decided guard', () => {
        it('hides decision section and action bar when study is APPROVED', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const }
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={approvedStudy} priorEntries={[]} reviewVersion={1} />,
            )

            expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Submit review' })).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
        })

        it('hides decision section and action bar when study is REJECTED', () => {
            const rejectedStudy = { ...study, status: 'REJECTED' as const }
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={rejectedStudy} priorEntries={[]} reviewVersion={1} />,
            )

            expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Submit review' })).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
        })

        it('hides decision section and action bar when study is CHANGE-REQUESTED', () => {
            const clarificationStudy = { ...study, status: 'CHANGE-REQUESTED' as const }
            renderWithProviders(
                <ProposalReviewView
                    orgSlug="test-org"
                    study={clarificationStudy}
                    priorEntries={[]}
                    reviewVersion={1}
                />,
            )

            expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Submit review' })).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
        })
    })
})
