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
import { beforeEach, describe, expect, it } from 'vitest'
import { ProposalReviewView } from './proposal-review-view'

describe('ProposalReviewView', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        memoryRouter.setCurrentUrl('/')
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
    })
})
