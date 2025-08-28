import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderWithProviders, mockSessionWithTestData } from '@/tests/unit.helpers'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { type Org } from '@/schema/org'
import { StudyReviewButtons } from './study-review-buttons'
import { reportMutationError } from '@/components/errors'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { memoryRouter } from 'next-router-mock'

// Mock the actions, now including doesTestImageExistForStudyAction for the new checkbox component
vi.mock('@/server/actions/study.actions', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/server/actions/study.actions')>()
    return {
        ...original,
        approveStudyProposalAction: vi.fn(),
        rejectStudyProposalAction: vi.fn(),
        doesTestImageExistForStudyAction: vi.fn(),
    }
})

// Mock the error reporting
vi.mock('@/components/errors', () => ({
    reportMutationError: vi.fn(() => vi.fn()),
}))

import { approveStudyProposalAction, rejectStudyProposalAction } from '@/server/actions/study.actions'

const mockApproveAction = vi.mocked(approveStudyProposalAction)
const mockRejectAction = vi.mocked(rejectStudyProposalAction)
const mockReportMutationError = vi.mocked(reportMutationError)

describe('StudyReviewButtons', () => {
    // This mock study is expanded to be type-correct for the new SelectedStudy type
    const mockStudy: SelectedStudy = {
        id: 'study-123',
        status: 'PENDING-REVIEW',
        title: 'Test Study',
        createdBy: 'Test Researcher',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'loc',
        createdAt: new Date(),
        dataSources: [],
        descriptionDocPath: null,
        irbDocPath: null,
        irbProtocols: null,
        orgId: 'org-123',
        orgSlug: 'test-org',
        outputMimeType: null,
        piName: 'Dr. Test',
        researcherId: 'res-123',
        reviewerId: null,
        agreementDocPath: null,
    }

    let org: Org

    beforeEach(async () => {
        vi.clearAllMocks()

        const resp = await mockSessionWithTestData({ isAdmin: true, orgSlug: mockStudy.orgSlug })
        org = resp.org

        mockApproveAction.mockResolvedValue(undefined)
        mockRejectAction.mockResolvedValue(undefined)
        mockReportMutationError.mockReturnValue(vi.fn())
    })

    it('renders approve and reject buttons for pending study', () => {
        renderWithProviders(<StudyReviewButtons study={mockStudy} />)

        expect(screen.getByText('Approve')).toBeInTheDocument()
        expect(screen.getByText('Reject')).toBeInTheDocument()
    })

    it('calls approve action when approve button is clicked', async () => {
        renderWithProviders(<StudyReviewButtons study={mockStudy} />)

        fireEvent.click(screen.getByText('Approve'))

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

        fireEvent.click(screen.getByText('Reject'))

        await waitFor(() => {
            expect(mockRejectAction).toHaveBeenCalledWith({
                orgSlug: org.slug,
                studyId: 'study-123',
            })
        })
    })

    it('redirects on successful approval', async () => {
        renderWithProviders(<StudyReviewButtons study={mockStudy} />)
        fireEvent.click(screen.getByText('Approve'))

        await waitFor(() => {
            expect(memoryRouter.asPath).toBe(`/reviewer/${org.slug}/dashboard`)
        })
    })

    it('handles error responses from server actions', async () => {
        mockRejectAction.mockResolvedValue({ error: 'Rejection failed' })
        renderWithProviders(<StudyReviewButtons study={mockStudy} />)

        fireEvent.click(screen.getByText('Reject'))

        await waitFor(() => {
            expect(mockReportMutationError).toHaveBeenCalledWith('Failed to update study status')
            const errorHandler = mockReportMutationError.mock.results[0].value
            expect(errorHandler).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Rejection failed' }),
                'REJECTED',
                undefined,
            )
        })
    })

    it('renders status message for an approved study', () => {
        const approvedStudy = { ...mockStudy, status: 'APPROVED' as const, approvedAt: new Date() }
        renderWithProviders(<StudyReviewButtons study={approvedStudy} />)

        expect(screen.getByText(/approved on/i)).toBeInTheDocument()
        expect(screen.queryByText('Approve')).not.toBeInTheDocument()
        expect(screen.queryByText('Reject')).not.toBeInTheDocument()
    })

    it('renders status message for a rejected study', () => {
        const rejectedStudy = { ...mockStudy, status: 'REJECTED' as const, rejectedAt: new Date() }
        renderWithProviders(<StudyReviewButtons study={rejectedStudy} />)

        expect(screen.getByText(/rejected on/i)).toBeInTheDocument()
        expect(screen.queryByText('Approve')).not.toBeInTheDocument()
        expect(screen.queryByText('Reject')).not.toBeInTheDocument()
    })
})
