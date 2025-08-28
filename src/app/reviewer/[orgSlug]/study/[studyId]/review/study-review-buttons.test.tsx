import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    renderWithProviders,
    screen,
    userEvent,
    mockSessionWithTestData,
    waitFor,
    insertTestStudyJobData,
} from '@/tests/unit.helpers'
import { StudyReviewButtons } from './study-review-buttons'
import { getStudyAction, doesTestImageExistForStudyAction, type SelectedStudy } from '@/server/actions/study.actions'

// Mock the action
vi.mock('@/server/actions/study.actions', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/server/actions/study.actions')>()
    return {
        ...original,
        approveStudyProposalAction: vi.fn(),
        rejectStudyProposalAction: vi.fn(),
        doesTestImageExistForStudyAction: vi.fn(),
    }
})

const mockDoesTestImageExistForStudyAction = vi.mocked(doesTestImageExistForStudyAction)

describe('StudyReviewButtons', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('for non-admin users', () => {
        it('does not show the test image checkbox', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: false, isReviewer: true })
            const { study: dbStudy } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
            })
            const study = await getStudyAction({ studyId: dbStudy.id })

            renderWithProviders(<StudyReviewButtons study={study} />)

            await waitFor(() => {
                expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
            })
        })
    })

    describe('for admin users', () => {
        let study: SelectedStudy

        beforeEach(async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, isReviewer: true })
            const { study: dbStudy } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
            })
            study = await getStudyAction({ studyId: dbStudy.id })
        })

        it('shows an enabled checkbox when a test image exists', async () => {
            mockDoesTestImageExistForStudyAction.mockResolvedValue(true)

            renderWithProviders(<StudyReviewButtons study={study} />)

            const checkbox = await screen.findByTestId('test-image-checkbox')
            expect(checkbox).toBeInTheDocument()
            expect(checkbox).toBeEnabled()
        })

        it('toggles the checkbox on click', async () => {
            const user = userEvent.setup()
            mockDoesTestImageExistForStudyAction.mockResolvedValue(true)

            renderWithProviders(<StudyReviewButtons study={study} />)

            const checkbox = (await screen.findByTestId('test-image-checkbox')) as HTMLInputElement
            expect(checkbox.checked).toBe(false)

            await user.click(checkbox)

            expect(checkbox.checked).toBe(true)
        })

        it('does not show the checkbox when no test image exists', async () => {
            mockDoesTestImageExistForStudyAction.mockResolvedValue(false)

            renderWithProviders(<StudyReviewButtons study={study} />)

            await waitFor(() => {
                expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
            })
        })
    })
})
