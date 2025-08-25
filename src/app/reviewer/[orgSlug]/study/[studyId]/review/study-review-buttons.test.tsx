import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders, screen, userEvent, mockSessionWithTestData, waitFor } from '@/tests/unit.helpers'
import { StudyReviewButtons } from './study-review-buttons'
import { type SelectedStudy, doesTestImageExistForStudyAction } from '@/server/actions/study.actions'

// Mock the action
vi.mock('@/server/actions/study.actions', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/server/actions/study.actions')>()
    return {
        ...original,
        doesTestImageExistForStudyAction: vi.fn(),
    }
})

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
    useParams: () => ({
        orgSlug: 'test-org',
    }),
}))

const mockStudy: SelectedStudy = {
    id: 'study-123',
    status: 'PENDING-REVIEW',
    title: 'Test Study',
    createdBy: 'Researcher',
    approvedAt: null,
    rejectedAt: null,
    containerLocation: 'loc',
    createdAt: new Date(),
    dataSources: [],
    irbProtocols: null,
    orgId: 'org-123',
    outputMimeType: null,
    piName: 'PI',
    researcherId: 'res-123',
    descriptionDocPath: null,
    irbDocPath: null,
    reviewerId: null,
    agreementDocPath: null,
}

const mockDoesTestImageExistForStudyAction = vi.mocked(doesTestImageExistForStudyAction)

describe('StudyReviewButtons', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('for non-admin users', () => {
        it('does not show the test image checkbox', async () => {
            await mockSessionWithTestData({ isAdmin: false })
            renderWithProviders(<StudyReviewButtons study={mockStudy} />)

            await waitFor(() => {
                expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
            })
        })
    })

    describe('for admin users', () => {
        beforeEach(async () => {
            await mockSessionWithTestData({ isAdmin: true })
        })

        it('shows an enabled checkbox when a test image exists', async () => {
            mockDoesTestImageExistForStudyAction.mockResolvedValue(true)

            // Use a unique study object to ensure a unique query key, avoiding cache collisions between tests.
            const uniqueStudy = { ...mockStudy, id: 'study-123-enabled' }
            renderWithProviders(<StudyReviewButtons study={uniqueStudy} />)

            const checkbox = await screen.findByTestId('test-image-checkbox')
            expect(checkbox).toBeInTheDocument()
            expect(checkbox).toBeEnabled()
        })

        it('toggles the checkbox on click', async () => {
            const user = userEvent.setup()
            mockDoesTestImageExistForStudyAction.mockResolvedValue(true)

            // Use a unique study object to ensure a unique query key, avoiding cache collisions between tests.
            const uniqueStudy = { ...mockStudy, id: 'study-789-toggle' }
            renderWithProviders(<StudyReviewButtons study={uniqueStudy} />)

            const checkbox = (await screen.findByTestId('test-image-checkbox')) as HTMLInputElement
            expect(checkbox.checked).toBe(false)

            await user.click(checkbox)

            expect(checkbox.checked).toBe(true)
        })

        it('does not show the checkbox when no test image exists', async () => {
            mockDoesTestImageExistForStudyAction.mockResolvedValue(false)

            // Use a unique study object to ensure a unique query key, avoiding cache collisions between tests.
            const uniqueStudy = { ...mockStudy, id: 'study-456-disabled' }
            renderWithProviders(<StudyReviewButtons study={uniqueStudy} />)

            await waitFor(() => {
                expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
            })
        })
    })
})
