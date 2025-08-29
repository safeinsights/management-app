import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    renderWithProviders,
    screen,
    userEvent,
    mockSessionWithTestData,
    insertTestStudyJobData,
    waitFor,
    actionResult,
} from '@/tests/unit.helpers'
import { StudyReviewButtons } from './study-review-buttons'
import {
    getStudyAction,
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'
import { memoryRouter } from 'next-router-mock'
import { reportMutationError } from '@/components/errors'

// Mock the actions
vi.mock('@/server/actions/study.actions', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/server/actions/study.actions')>()
    return {
        ...original,
        approveStudyProposalAction: vi.fn(),
        rejectStudyProposalAction: vi.fn(),
        doesTestImageExistForStudyAction: vi.fn(), // still needed by the new component
    }
})

// Mock the error reporting
vi.mock('@/components/errors', () => ({
    reportMutationError: vi.fn(() => vi.fn()),
}))

const mockApproveAction = vi.mocked(approveStudyProposalAction)
const mockRejectAction = vi.mocked(rejectStudyProposalAction)
const mockReportMutationError = vi.mocked(reportMutationError)

describe('StudyReviewButtons', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        vi.clearAllMocks()
        const { org, user } = await mockSessionWithTestData({ isAdmin: true, isReviewer: true, orgSlug: 'test-org' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))

        mockReportMutationError.mockReturnValue(vi.fn())
    })

    it('renders Approve and Reject buttons for a pending study', () => {
        renderWithProviders(<StudyReviewButtons study={study} />)
        expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    })

    it('calls approve action on Approve button click', async () => {
        mockApproveAction.mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderWithProviders(<StudyReviewButtons study={study} />)

        const approveButton = screen.getByRole('button', { name: 'Approve' })
        await user.click(approveButton)

        expect(mockApproveAction).toHaveBeenCalledWith({
            studyId: study.id,
            orgSlug: 'test-org',
            useTestImage: false,
        })
    })

    it('calls reject action on Reject button click', async () => {
        mockRejectAction.mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderWithProviders(<StudyReviewButtons study={study} />)

        const rejectButton = screen.getByRole('button', { name: 'Reject' })
        await user.click(rejectButton)

        expect(mockRejectAction).toHaveBeenCalledWith({
            studyId: study.id,
            orgSlug: 'test-org',
        })
    })

    it('redirects on successful approval', async () => {
        const user = userEvent.setup()
        mockApproveAction.mockResolvedValueOnce(undefined) // simulate successful action
        renderWithProviders(<StudyReviewButtons study={study} />)

        const approveButton = screen.getByRole('button', { name: 'Approve' })
        await user.click(approveButton)

        await waitFor(() => {
            expect(memoryRouter.asPath).toBe('/reviewer/test-org/dashboard')
        })
    })

    it('renders status for approved study and no buttons', async () => {
        const approvedStudy = { ...study, status: 'APPROVED' as const, approvedAt: new Date() }
        renderWithProviders(<StudyReviewButtons study={approvedStudy} />)

        expect(screen.getByText(/approved on/i)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    })

    it('renders status for rejected study and no buttons', async () => {
        const rejectedStudy = { ...study, status: 'REJECTED' as const, rejectedAt: new Date() }
        renderWithProviders(<StudyReviewButtons study={rejectedStudy} />)

        expect(screen.getByText(/rejected on/i)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    })

    it('handles error responses from server actions', async () => {
        const user = userEvent.setup()
        // Mock the reject action to return an error
        mockRejectAction.mockResolvedValue({ error: 'Rejection failed due to network error' })

        renderWithProviders(<StudyReviewButtons study={study} />)

        const rejectButton = screen.getByRole('button', { name: 'Reject' })
        await user.click(rejectButton)

        // Wait for the mutation to complete and verify the error handler was called
        await waitFor(() => {
            expect(mockReportMutationError).toHaveBeenCalledWith('Failed to update study status')
            const errorHandler = mockReportMutationError.mock.results[0].value
            expect(errorHandler).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Rejection failed due to network error' }),
                'REJECTED',
                undefined,
            )
        })
    })
})
