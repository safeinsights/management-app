import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    renderWithProviders,
    screen,
    userEvent,
    mockSessionWithTestData,
    insertTestStudyJobData,
    waitFor,
} from '@/tests/unit.helpers'
import { StudyReviewButtons } from './study-review-buttons'
import {
    getStudyAction,
    approveStudyProposalAction,
    rejectStudyProposalAction,
    type SelectedStudy,
} from '@/server/actions/study.actions'
import { memoryRouter } from 'next-router-mock'

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

const mockApproveAction = vi.mocked(approveStudyProposalAction)
const mockRejectAction = vi.mocked(rejectStudyProposalAction)

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
        study = await getStudyAction({ studyId: dbStudy.id })
    })

    it('renders Approve and Reject buttons for a pending study', () => {
        renderWithProviders(<StudyReviewButtons study={study} />)
        expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    })

    it('calls approve action on Approve button click', async () => {
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
})
