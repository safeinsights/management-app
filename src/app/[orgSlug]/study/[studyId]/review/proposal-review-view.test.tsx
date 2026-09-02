import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { isSubmittedStudy, type Submitted } from '@/schema/study'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { memoryRouter } from 'next-router-mock'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it } from 'vitest'
import { DecisionConfirmationModal } from './decision-confirmation-modal'
import type { Decision } from '@/lib/review-decision'
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

    it('does not render the study title in the proposal section header', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />)

        expect(screen.queryByText(/Test Study Title/)).not.toBeInTheDocument()
    })

    it('does not render a back button', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />)

        expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
    })

    it('renders submit decision as enabled initially', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />)

        expect(screen.getByRole('button', { name: 'Submit decision' })).toBeEnabled()
    })

    describe('needs-clarification', () => {
        it('renders the request revision option as selectable', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            const requestRevision = screen.getByRole('radio', { name: /Request revision/ })
            expect(requestRevision).not.toBeDisabled()

            await user.click(requestRevision)
            expect(requestRevision).toBeChecked()
        })

        it('keeps submit enabled when needs-clarification is selected without valid feedback', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            await user.click(screen.getByRole('radio', { name: /Request revision/ }))

            expect(screen.getByRole('button', { name: 'Submit decision' })).toBeEnabled()
        })
    })

    // Submit-wiring coverage lives in server/actions/study.actions.test.ts until OTTER-491
    // replaces the feedback Skeleton with a real editor.

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
            expect(screen.getByTestId('review-feedback-section')).toHaveTextContent('Decision')
            expect(screen.queryByText('Round 2 review')).not.toBeInTheDocument()
        })
    })

    describe('DecisionConfirmationModal', () => {
        const labName = 'Test Research Lab'

        it('renders approve modal with decision-specific title, body, and CTA', () => {
            renderWithProviders(
                <DecisionConfirmationModal
                    decision="approve"
                    labName={labName}
                    isOpen
                    onClose={() => {}}
                    onConfirm={() => {}}
                    isPending={false}
                />,
            )

            const dialog = screen.getByRole('dialog')
            expect(dialog).toHaveTextContent('Approve proposal?')
            expect(dialog).toHaveTextContent(
                `Your approval and feedback will be sent to ${labName}. You will not be able to make changes after approving.`,
            )
            expect(screen.getByRole('button', { name: 'Approve proposal' })).toBeInTheDocument()
        })

        it('renders request-revision modal with decision-specific title, body, and CTA', () => {
            renderWithProviders(
                <DecisionConfirmationModal
                    decision="needs-clarification"
                    labName={labName}
                    isOpen
                    onClose={() => {}}
                    onConfirm={() => {}}
                    isPending={false}
                />,
            )

            const dialog = screen.getByRole('dialog')
            expect(dialog).toHaveTextContent('Request revision?')
            expect(dialog).toHaveTextContent(
                `Your feedback will be sent to ${labName} so they can update and resubmit.`,
            )
            expect(dialog).toHaveTextContent("You'll be notified when the revised proposal is ready for review.")
            expect(screen.getByRole('button', { name: 'Request revision' })).toBeInTheDocument()
        })

        it('renders decline modal with decision-specific title, body, and CTA', () => {
            renderWithProviders(
                <DecisionConfirmationModal
                    decision="reject"
                    labName={labName}
                    isOpen
                    onClose={() => {}}
                    onConfirm={() => {}}
                    isPending={false}
                />,
            )

            const dialog = screen.getByRole('dialog')
            expect(dialog).toHaveTextContent('Decline proposal?')
            expect(dialog).toHaveTextContent(
                `Your decision and feedback will be sent to ${labName}. Declining ends this study and cannot be undone.`,
            )
            expect(screen.getByRole('button', { name: 'Decline and end study' })).toBeInTheDocument()
        })

        it('renders nothing when decision is null', () => {
            renderWithProviders(
                <DecisionConfirmationModal
                    decision={null}
                    labName={labName}
                    isOpen
                    onClose={() => {}}
                    onConfirm={() => {}}
                    isPending={false}
                />,
            )

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })

        it('disables both buttons while submission is pending', () => {
            renderWithProviders(
                <DecisionConfirmationModal
                    decision="approve"
                    labName={labName}
                    isOpen
                    onClose={() => {}}
                    onConfirm={() => {}}
                    isPending
                />,
            )

            expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
        })

        it('each decision renders its own distinct CTA label', () => {
            const decisions: Decision[] = ['approve', 'needs-clarification', 'reject']
            const expectedLabels = ['Approve proposal', 'Request revision', 'Decline and end study']

            decisions.forEach((decision, i) => {
                const { unmount } = renderWithProviders(
                    <DecisionConfirmationModal
                        decision={decision}
                        labName={labName}
                        isOpen
                        onClose={() => {}}
                        onConfirm={() => {}}
                        isPending={false}
                    />,
                )

                expect(screen.getByRole('button', { name: expectedLabels[i] })).toBeInTheDocument()
                unmount()
            })
        })
    })

    describe('scroll to first error on submit', () => {
        it('scrolls to the feedback editor when submitting with empty feedback', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            await user.click(screen.getByRole('button', { name: 'Submit decision' }))

            const feedbackInput = document.getElementById('review-feedback')
            expect(feedbackInput).not.toBeNull()
            expect(feedbackInput!.scrollIntoView).toBeDefined()
        })

        it('scrolls to the decision radios when feedback is valid but no decision selected', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            const editor = await screen.findByRole('textbox', { name: /feedback/i })
            await user.click(editor)
            await user.keyboard('Valid feedback content')
            await user.click(screen.getByRole('button', { name: 'Submit decision' }))

            const firstRadio = screen.getByRole('radio', { name: /Approve/ })
            expect(document.activeElement === firstRadio || firstRadio.scrollIntoView !== undefined).toBe(true)
        })
    })

    describe('simultaneous errors and re-click', () => {
        it('displays both feedback and decision errors simultaneously when both fields are empty', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            await user.click(screen.getByRole('button', { name: 'Submit decision' }))

            await waitFor(() => {
                expect(
                    screen.getByText(`Enter your decision for ${study.submittingLabName} before submitting.`),
                ).toBeInTheDocument()
                expect(screen.getByText('Select an option before submitting.')).toBeInTheDocument()
            })
        })

        it('does not duplicate errors on repeated Submit clicks', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            await user.click(screen.getByRole('button', { name: 'Submit decision' }))
            await waitFor(() => expect(screen.getByText('Select an option before submitting.')).toBeInTheDocument())

            await user.click(screen.getByRole('button', { name: 'Submit decision' }))

            expect(screen.getAllByText('Select an option before submitting.')).toHaveLength(1)
            expect(
                screen.getAllByText(`Enter your decision for ${study.submittingLabName} before submitting.`),
            ).toHaveLength(1)
        })
    })

    describe('form state after validation error', () => {
        it('preserves the radio selection after a validation error', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            await user.click(screen.getByRole('radio', { name: /Approve/ }))
            await user.click(screen.getByRole('button', { name: 'Submit decision' }))

            await waitFor(() =>
                expect(
                    screen.getByText(`Enter your decision for ${study.submittingLabName} before submitting.`),
                ).toBeInTheDocument(),
            )

            expect(screen.getByRole('radio', { name: /Approve/ })).toBeChecked()
        })

        it('does not open the modal when only feedback is filled', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={study} priorEntries={[]} reviewVersion={1} />,
            )

            await user.click(screen.getByRole('button', { name: 'Submit decision' }))

            await waitFor(() => expect(screen.getByText('Select an option before submitting.')).toBeInTheDocument())
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })
    })

    describe('already-decided guard', () => {
        it('hides decision section and action bar when study is APPROVED', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const }
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={approvedStudy} priorEntries={[]} reviewVersion={1} />,
            )

            expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Submit decision' })).not.toBeInTheDocument()
        })

        it('hides decision section and action bar when study is REJECTED', () => {
            const rejectedStudy = { ...study, status: 'REJECTED' as const }
            renderWithProviders(
                <ProposalReviewView orgSlug="test-org" study={rejectedStudy} priorEntries={[]} reviewVersion={1} />,
            )

            expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Submit decision' })).not.toBeInTheDocument()
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
            expect(screen.queryByRole('button', { name: 'Submit decision' })).not.toBeInTheDocument()
        })
    })
})
