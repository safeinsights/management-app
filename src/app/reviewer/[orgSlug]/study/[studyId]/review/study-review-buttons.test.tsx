import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderWithProviders, mockSessionWithTestData } from '@/tests/unit.helpers'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Org } from '@/schema/org'
import { StudyReviewButtons } from './study-review-buttons'
import { reportMutationError } from '@/components/errors'
import type { SelectedStudy } from '@/server/actions/study.actions'

// Mock the actions
vi.mock('@/server/actions/study.actions', () => ({
    approveStudyProposalAction: vi.fn(),
    rejectStudyProposalAction: vi.fn(),
}))

// Mock the error reporting
vi.mock('@/components/errors', () => ({
    reportMutationError: vi.fn(() => vi.fn()),
    reportError: vi.fn(),
}))

// Don't mock common - we want to test the real useMutation wrapper

import { approveStudyProposalAction, rejectStudyProposalAction } from '@/server/actions/study.actions'

const mockApproveAction = vi.mocked(approveStudyProposalAction)
const mockRejectAction = vi.mocked(rejectStudyProposalAction)
const mockReportMutationError = vi.mocked(reportMutationError)

describe('StudyReviewButtons', () => {
    const mockStudy: SelectedStudy = {
        id: 'study-123',
        status: 'PENDING-REVIEW',
        approvedAt: null,
        rejectedAt: null,
        title: 'Test Study',
        createdAt: new Date(),
        orgId: 'org-123',
        // Add other required fields as needed
    } as SelectedStudy

    let org: Org

    beforeEach(async () => {
        vi.clearAllMocks()

        const resp = await mockSessionWithTestData({ isAdmin: true })
        org = resp.org

        // Mock server actions to return success responses by default
        mockApproveAction.mockResolvedValue(undefined)
        mockRejectAction.mockResolvedValue(undefined)

        // Setup reportMutationError to return a mock function
        mockReportMutationError.mockReturnValue(vi.fn())
    })

    it('renders approve and reject buttons for pending study', () => {
        renderWithProviders(<StudyReviewButtons study={mockStudy} />)

        expect(screen.getByText('Approve')).toBeInTheDocument()
        expect(screen.getByText('Reject')).toBeInTheDocument()
    })

    it('calls reportMutationError when server action returns error', async () => {
        // Mock the approve action to return an error
        mockApproveAction.mockResolvedValue({ error: 'Approval failed' })

        renderWithProviders(<StudyReviewButtons study={mockStudy} />)

        const approveButton = screen.getByText('Approve')
        fireEvent.click(approveButton)

        // Wait for the mutation to complete and verify reportError was called
        await waitFor(() => {
            expect(mockReportMutationError).toHaveBeenCalledWith('Failed to update study status')
        })
    })

    it('calls approve action when approve button is clicked', async () => {
        renderWithProviders(<StudyReviewButtons study={mockStudy} />)

        const approveButton = screen.getByText('Approve')
        fireEvent.click(approveButton)

        await waitFor(() => {
            expect(mockApproveAction).toHaveBeenCalledWith({
                orgSlug: org.slug,
                studyId: 'study-123',
                useTestImage: false,
            })
        })
    })

    it('calls reject action when reject button is clicked', async () => {
        renderWithProviders(<StudyReviewButtons study={mockStudy} />)

        const rejectButton = screen.getByText('Reject')
        fireEvent.click(rejectButton)

        await waitFor(() => {
            expect(mockRejectAction).toHaveBeenCalledWith({
                orgSlug: org.slug,
                studyId: 'study-123',
            })
        })
    })

    it('handles successful approval', async () => {
        renderWithProviders(<StudyReviewButtons study={mockStudy} />)

        const approveButton = screen.getByText('Approve')
        fireEvent.click(approveButton)

        await waitFor(() => {
            expect(mockApproveAction).toHaveBeenCalledWith({
                orgSlug: org.slug,
                studyId: 'study-123',
                useTestImage: false,
            })
        })

        // Verify error handler was NOT called for successful response
        expect(mockReportMutationError).toHaveBeenCalledWith('Failed to update study status')
        const errorHandler = mockReportMutationError.mock.results[0].value
        expect(errorHandler).not.toHaveBeenCalled()
    })

    it('handles successful rejection', async () => {
        renderWithProviders(<StudyReviewButtons study={mockStudy} />)

        const rejectButton = screen.getByText('Reject')
        fireEvent.click(rejectButton)

        await waitFor(() => {
            expect(mockRejectAction).toHaveBeenCalledWith({
                orgSlug: org.slug,
                studyId: 'study-123',
            })
        })

        // Verify error handler was NOT called for successful response
        expect(mockReportMutationError).toHaveBeenCalledWith('Failed to update study status')
        const errorHandler = mockReportMutationError.mock.results[0].value
        expect(errorHandler).not.toHaveBeenCalled()
    })

    it('handles error responses from server actions', async () => {
        // Mock the reject action to return an error
        mockRejectAction.mockResolvedValue({ error: 'Rejection failed due to network error' })

        renderWithProviders(<StudyReviewButtons study={mockStudy} />)

        const rejectButton = screen.getByText('Reject')
        fireEvent.click(rejectButton)

        // Wait for the mutation to complete and verify the error handler was called
        await waitFor(() => {
            expect(mockReportMutationError).toHaveBeenCalledWith('Failed to update study status')
            const errorHandler = mockReportMutationError.mock.results[0].value
            expect(errorHandler).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Rejection failed due to network error' }),
                'REJECTED',
                undefined,
            )
        })
    })

    it('does not render buttons for approved study', () => {
        const approvedStudy = { ...mockStudy, status: 'APPROVED' as const, approvedAt: new Date() }
        renderWithProviders(<StudyReviewButtons study={approvedStudy} />)

        expect(screen.queryByText('Approve')).not.toBeInTheDocument()
        expect(screen.queryByText('Reject')).not.toBeInTheDocument()
    })

    it('does not render buttons for rejected study', () => {
        const rejectedStudy = { ...mockStudy, status: 'REJECTED' as const, rejectedAt: new Date() }
        renderWithProviders(<StudyReviewButtons study={rejectedStudy} />)

        expect(screen.queryByText('Approve')).not.toBeInTheDocument()
        expect(screen.queryByText('Reject')).not.toBeInTheDocument()
    })
})
