import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
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
import { memoryRouter } from 'next-router-mock'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProposalReviewView } from './proposal-review-view'

vi.mock('@/hooks/use-review-feedback', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/hooks/use-review-feedback')>()
    return {
        ...original,
        useReviewFeedback: vi.fn(() => ({
            value: '',
            onChange: vi.fn(),
            wordCount: 0,
            minWords: 50,
            maxWords: 500,
            isValid: false,
        })),
    }
})

const mockedUseReviewFeedback = vi.mocked(useReviewFeedback)

function validFeedbackState() {
    return {
        value: 'A'.repeat(100),
        onChange: vi.fn(),
        wordCount: 60,
        minWords: 50,
        maxWords: 500,
        isValid: true,
    }
}

describe('ProposalReviewView', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        memoryRouter.setCurrentUrl('/')
        mockedUseReviewFeedback.mockReturnValue({
            value: '',
            onChange: vi.fn(),
            wordCount: 0,
            minWords: 50,
            maxWords: 500,
            isValid: false,
        })
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

    describe('submit gating', () => {
        it('submit button is disabled when no decision selected (valid feedback)', () => {
            mockedUseReviewFeedback.mockReturnValue(validFeedbackState())
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled()
        })

        it('submit button is disabled when feedback is invalid (decision selected)', async () => {
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Approve/ }))

            expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled()
        })

        it.each([['Approve'], ['Needs clarification'], ['Reject']])(
            'submit button is enabled when %s selected + feedback valid',
            async (optionLabel) => {
                mockedUseReviewFeedback.mockReturnValue(validFeedbackState())
                const user = userEvent.setup()
                renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

                await user.click(screen.getByRole('radio', { name: new RegExp(optionLabel) }))

                expect(screen.getByRole('button', { name: 'Submit review' })).toBeEnabled()
            },
        )
    })

    describe('confirmation modals', () => {
        it('Approve + submit opens the "Confirm review submission?" modal', async () => {
            mockedUseReviewFeedback.mockReturnValue(validFeedbackState())
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Approve/ }))
            await user.click(screen.getByRole('button', { name: 'Submit review' }))

            expect(await screen.findByRole('dialog', { name: 'Confirm review submission?' })).toBeInTheDocument()
        })

        it('Needs clarification + submit opens the "Confirm review submission?" modal', async () => {
            mockedUseReviewFeedback.mockReturnValue(validFeedbackState())
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Needs clarification/ }))
            await user.click(screen.getByRole('button', { name: 'Submit review' }))

            expect(await screen.findByRole('dialog', { name: 'Confirm review submission?' })).toBeInTheDocument()
        })

        it('Reject + submit opens the "Reject initial request?" modal', async () => {
            mockedUseReviewFeedback.mockReturnValue(validFeedbackState())
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Reject/ }))
            await user.click(screen.getByRole('button', { name: 'Submit review' }))

            expect(await screen.findByRole('dialog', { name: 'Reject initial request?' })).toBeInTheDocument()
        })
    })

    describe('submission flows', () => {
        it('Approve → confirm sets study status to APPROVED and redirects to dashboard', async () => {
            mockedUseReviewFeedback.mockReturnValue(validFeedbackState())
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Approve/ }))
            await user.click(screen.getByRole('button', { name: 'Submit review' }))
            await user.click(await screen.findByRole('button', { name: 'Yes, submit review' }))

            await waitFor(async () => {
                const updated = await db
                    .selectFrom('study')
                    .select(['status'])
                    .where('id', '=', study.id)
                    .executeTakeFirstOrThrow()
                expect(updated.status).toBe('APPROVED')
            })

            await waitFor(() => {
                expect(memoryRouter.asPath).toBe('/test-org/dashboard')
            })
        })

        it('Reject → confirm sets study status to REJECTED and redirects to dashboard', async () => {
            mockedUseReviewFeedback.mockReturnValue(validFeedbackState())
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Reject/ }))
            await user.click(screen.getByRole('button', { name: 'Submit review' }))
            await user.click(await screen.findByRole('button', { name: 'Reject initial request' }))

            await waitFor(async () => {
                const updated = await db
                    .selectFrom('study')
                    .select(['status'])
                    .where('id', '=', study.id)
                    .executeTakeFirstOrThrow()
                expect(updated.status).toBe('REJECTED')
            })

            await waitFor(() => {
                expect(memoryRouter.asPath).toBe('/test-org/dashboard')
            })
        })

        it('Needs clarification → confirm logs console.warn and leaves study unchanged (placeholder path)', async () => {
            mockedUseReviewFeedback.mockReturnValue(validFeedbackState())
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const user = userEvent.setup()
            renderWithProviders(<ProposalReviewView orgSlug="test-org" study={study} />)

            await user.click(screen.getByRole('radio', { name: /Needs clarification/ }))
            await user.click(screen.getByRole('button', { name: 'Submit review' }))
            await user.click(await screen.findByRole('button', { name: 'Yes, submit review' }))

            await waitFor(() => {
                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('OTTER-492'))
            })

            const updated = await db
                .selectFrom('study')
                .select(['status'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updated.status).toBe('PENDING-REVIEW')
            expect(memoryRouter.asPath).not.toBe('/test-org/dashboard')

            warnSpy.mockRestore()
        })

        // TODO(OTTER-493): unskip once 'PROPOSAL-CHANGE-REQUESTED' status is added to the
        // StudyStatus enum and the unified submitProposalReviewAction ships.
        it.skip('Needs clarification → confirm sets study status to `proposal change requested` for both RL and DO', () => {
            // Will exercise the real unified submitProposalReviewAction once OTTER-493 lands.
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
