import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    type Mock,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it } from 'vitest'
import { NewProposalReviewView } from './new-proposal-review-view'

describe('NewProposalReviewView', () => {
    let study: SelectedStudy

    beforeEach(async () => {
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

    it('renders all stub sections', () => {
        renderWithProviders(<NewProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByTestId('review-progress-bar')).toBeInTheDocument()
        expect(screen.getByTestId('proposal-section')).toBeInTheDocument()
        expect(screen.getByTestId('review-feedback-section')).toBeInTheDocument()
        expect(screen.getByTestId('review-decision-section')).toBeInTheDocument()
    })

    it('renders the page title', () => {
        renderWithProviders(<NewProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByRole('heading', { name: 'Study proposal', level: 1 })).toBeInTheDocument()
    })

    it('renders the study title in proposal section', () => {
        renderWithProviders(<NewProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByText(/Test Study Title/)).toBeInTheDocument()
    })

    it('renders the submit button as disabled initially', () => {
        renderWithProviders(<NewProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled()
    })

    it('renders the back button', () => {
        renderWithProviders(<NewProposalReviewView orgSlug="test-org" study={study} />)

        expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })
})
