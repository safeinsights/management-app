import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    type Mock,
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProposalReviewView } from './proposal-review-view'

const proposalReviewMocks = vi.hoisted(() => ({
    feedback: {
        value: '',
        wordCount: 0,
        isValid: false,
    },
    submitReview: vi.fn(),
}))

vi.mock('@/hooks/use-review-feedback', () => ({
    useReviewFeedback: () => ({
        value: proposalReviewMocks.feedback.value,
        onChange: vi.fn(),
        wordCount: proposalReviewMocks.feedback.wordCount,
        minWords: 50,
        maxWords: 500,
        isValid: proposalReviewMocks.feedback.isValid,
    }),
}))

vi.mock('@/hooks/use-proposal-review-mutation', () => ({
    useProposalReviewMutation: () => ({
        submitReview: proposalReviewMocks.submitReview,
        isPending: false,
    }),
}))

describe('ProposalReviewView', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        memoryRouter.setCurrentUrl('/')
        proposalReviewMocks.feedback.value = ''
        proposalReviewMocks.feedback.wordCount = 0
        proposalReviewMocks.feedback.isValid = false
        proposalReviewMocks.submitReview.mockReset()
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'Test Study Title',
        })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'test-org', studyId: study.id })
    })

    it('renders all sections', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByTestId('review-progress-bar')).toBeInTheDocument()
        expect(screen.getByTestId('proposal-section')).toBeInTheDocument()
        expect(screen.getByTestId('review-feedback-section')).toBeInTheDocument()
        expect(screen.getByTestId('review-decision-section')).toBeInTheDocument()
    })

    it('renders the page title', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByRole('heading', { name: 'Review initial request', level: 1 })).toBeInTheDocument()
    })

    it('renders the study title in proposal section', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByText(/Test Study Title/)).toBeInTheDocument()
    })

    it('renders the back button', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByRole('button', { name: /Back/ })).toBeInTheDocument()
    })

    it('renders submit review as disabled initially', () => {
        renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled()
    })

    describe('needs-clarification', () => {
        it('renders the needs-clarification option as selectable', async () => {
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            const needsClarification = screen.getByRole('radio', { name: /Needs clarification/ })
            expect(needsClarification).not.toBeDisabled()

            await user.click(needsClarification)
            expect(needsClarification).toBeChecked()
        })

        it('keeps submit disabled when needs-clarification is selected without valid feedback', async () => {
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Needs clarification/ }))

            // Feedback editor is still skeleton until OTTER-491 lands, so submit stays gated on invalid feedback
            expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled()
        })
    })

    describe('submit wiring', () => {
        beforeEach(() => {
            proposalReviewMocks.feedback.value = 'valid feedback '.repeat(60).trim()
            proposalReviewMocks.feedback.wordCount = 120
            proposalReviewMocks.feedback.isValid = true
        })

        it('submits approve through the unified mutation after confirmation', async () => {
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Approve/ }))
            await user.click(screen.getByRole('button', { name: 'Submit review' }))
            await user.click(screen.getByRole('button', { name: 'Yes, submit review' }))

            expect(proposalReviewMocks.submitReview).toHaveBeenCalledWith({
                decision: 'approve',
                feedback: proposalReviewMocks.feedback.value,
            })
        })

        it('submits needs clarification through the unified mutation after confirmation', async () => {
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Needs clarification/ }))
            await user.click(screen.getByRole('button', { name: 'Submit review' }))
            await user.click(screen.getByRole('button', { name: 'Yes, submit review' }))

            expect(proposalReviewMocks.submitReview).toHaveBeenCalledWith({
                decision: 'needs-clarification',
                feedback: proposalReviewMocks.feedback.value,
            })
        })

        it('submits reject through the destructive modal', async () => {
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Reject/ }))
            await user.click(screen.getByRole('button', { name: 'Submit review' }))

            expect(screen.getByText('Reject initial request?')).toBeInTheDocument()

            await user.click(screen.getByRole('button', { name: 'Reject initial request' }))

            expect(proposalReviewMocks.submitReview).toHaveBeenCalledWith({
                decision: 'reject',
                feedback: proposalReviewMocks.feedback.value,
            })
        })
    })

    describe('already-decided guard', () => {
        it('hides decision section and action bar when study is APPROVED', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const }
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={approvedStudy} />)

            expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Submit review' })).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
        })

        it('hides decision section and action bar when study is REJECTED', () => {
            const rejectedStudy = { ...study, status: 'REJECTED' as const }
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={rejectedStudy} />)

            expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Submit review' })).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
        })

        it('hides decision section and action bar when study is PROPOSAL-CHANGE-REQUESTED', () => {
            const clarificationStudy = { ...study, status: 'PROPOSAL-CHANGE-REQUESTED' as const }
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={clarificationStudy} />)

            expect(screen.queryByTestId('review-decision-section')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Submit review' })).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
        })
    })
})
