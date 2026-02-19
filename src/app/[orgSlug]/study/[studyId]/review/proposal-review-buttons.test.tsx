import { reportMutationError } from '@/components/errors'
import {
    approveStudyProposalAction,
    getStudyAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProposalReviewButtons } from './proposal-review-buttons'

vi.mock('@/server/actions/study.actions', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/server/actions/study.actions')>()
    return {
        ...original,
        approveStudyProposalAction: vi.fn(),
        rejectStudyProposalAction: vi.fn(),
    }
})

vi.mock('@/components/errors', () => ({
    reportMutationError: vi.fn(() => vi.fn()),
}))

const mockApproveAction = vi.mocked(approveStudyProposalAction)
const mockRejectAction = vi.mocked(rejectStudyProposalAction)
const mockReportMutationError = vi.mocked(reportMutationError)

describe('ProposalReviewButtons', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        vi.clearAllMocks()
        const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave', orgSlug: 'test-org' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))

        vi.mocked(useParams).mockReturnValue({
            orgSlug: 'test-org',
            studyId: study.id,
        })

        mockReportMutationError.mockReturnValue(vi.fn())
    })

    it('calls approveStudyProposalAction on approve click', async () => {
        mockApproveAction.mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderWithProviders(<ProposalReviewButtons study={study} orgSlug="test-org" />)

        const approveButton = screen.getByRole('button', { name: 'Approve request' })
        await user.click(approveButton)

        expect(mockApproveAction).toHaveBeenCalledWith({
            studyId: study.id,
            orgSlug: 'test-org',
        })
    })

    it('calls rejectStudyProposalAction on reject click', async () => {
        mockRejectAction.mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderWithProviders(<ProposalReviewButtons study={study} orgSlug="test-org" />)

        const rejectButton = screen.getByRole('button', { name: 'Reject request' })
        await user.click(rejectButton)

        expect(mockRejectAction).toHaveBeenCalledWith({
            studyId: study.id,
            orgSlug: 'test-org',
        })
    })

    it('redirects to org dashboard on successful approval', async () => {
        const user = userEvent.setup()
        mockApproveAction.mockResolvedValueOnce(undefined)
        renderWithProviders(<ProposalReviewButtons study={study} orgSlug="test-org" />)

        const approveButton = screen.getByRole('button', { name: 'Approve request' })
        await user.click(approveButton)

        await waitFor(() => {
            expect(memoryRouter.asPath).toBe('/test-org/dashboard')
        })
    })

    it('redirects to org dashboard on successful rejection', async () => {
        const user = userEvent.setup()
        mockRejectAction.mockResolvedValueOnce(undefined)
        renderWithProviders(<ProposalReviewButtons study={study} orgSlug="test-org" />)

        const rejectButton = screen.getByRole('button', { name: 'Reject request' })
        await user.click(rejectButton)

        await waitFor(() => {
            expect(memoryRouter.asPath).toBe('/test-org/dashboard')
        })
    })

    it('does not render buttons when study is APPROVED', () => {
        const approvedStudy = { ...study, status: 'APPROVED' as const, approvedAt: new Date() }
        renderWithProviders(<ProposalReviewButtons study={approvedStudy} orgSlug="test-org" />)

        expect(screen.queryByRole('button', { name: 'Approve request' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reject request' })).not.toBeInTheDocument()
    })

    it('does not render buttons when study is REJECTED', () => {
        const rejectedStudy = { ...study, status: 'REJECTED' as const, rejectedAt: new Date() }
        renderWithProviders(<ProposalReviewButtons study={rejectedStudy} orgSlug="test-org" />)

        expect(screen.queryByRole('button', { name: 'Approve request' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reject request' })).not.toBeInTheDocument()
    })

    it('handles error responses from server actions', async () => {
        const user = userEvent.setup()
        mockRejectAction.mockResolvedValue({ error: 'Rejection failed due to network error' })

        renderWithProviders(<ProposalReviewButtons study={study} orgSlug="test-org" />)

        const rejectButton = screen.getByRole('button', { name: 'Reject request' })
        await user.click(rejectButton)

        await waitFor(() => {
            expect(mockReportMutationError).toHaveBeenCalledWith('Failed to update study status')
            const errorHandler = mockReportMutationError.mock.results[0].value
            expect(errorHandler).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Rejection failed due to network error' }),
                'REJECTED',
                undefined,
                expect.anything(),
            )
        })
    })
})
