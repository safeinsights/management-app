import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    renderWithProviders,
    screen,
    userEvent,
    mockSessionWithTestData,
    waitFor,
    insertTestStudyJobData,
} from '@/tests/unit.helpers'
import { TestImageCheckbox } from './test-image-checkbox'
import { doesTestImageExistForStudyAction } from '@/server/actions/study.actions'

vi.mock('@/server/actions/study.actions', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/server/actions/study.actions')>()
    return {
        ...original,
        doesTestImageExistForStudyAction: vi.fn(),
    }
})

const mockDoesTestImageExistForStudyAction = vi.mocked(doesTestImageExistForStudyAction)

describe('TestImageCheckbox', () => {
    let studyId: string
    let onChange: (checked: boolean) => void

    beforeEach(async () => {
        onChange = vi.fn()
        const { org, user } = await mockSessionWithTestData({ isAdmin: true, isReviewer: true })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        studyId = dbStudy.id
    })

    it('renders nothing for non-admin users', async () => {
        await mockSessionWithTestData({ isAdmin: false, isReviewer: true })
        renderWithProviders(<TestImageCheckbox studyId={studyId} checked={false} onChange={onChange} />)
        expect(screen.queryByTestId('test-image-checkbox')).not.toBeInTheDocument()
    })

    it('renders nothing when no test image exists', async () => {
        mockDoesTestImageExistForStudyAction.mockResolvedValue(false)
        renderWithProviders(<TestImageCheckbox studyId={studyId} checked={false} onChange={onChange} />)
        await waitFor(() => {
            expect(screen.queryByTestId('test-image-checkbox')).not.toBeInTheDocument()
        })
    })

    describe('when a test image exists', () => {
        beforeEach(() => {
            mockDoesTestImageExistForStudyAction.mockResolvedValue(true)
        })

        it('renders an enabled checkbox', async () => {
            renderWithProviders(<TestImageCheckbox studyId={studyId} checked={false} onChange={onChange} />)
            const checkbox = await screen.findByTestId('test-image-checkbox')
            expect(checkbox).toBeInTheDocument()
            expect(checkbox).toBeEnabled()
        })

        it('is checked when checked prop is true', async () => {
            renderWithProviders(<TestImageCheckbox studyId={studyId} checked={true} onChange={onChange} />)
            const checkbox = (await screen.findByTestId('test-image-checkbox')) as HTMLInputElement
            expect(checkbox.checked).toBe(true)
        })

        it('is not checked when checked prop is false', async () => {
            renderWithProviders(<TestImageCheckbox studyId={studyId} checked={false} onChange={onChange} />)
            const checkbox = (await screen.findByTestId('test-image-checkbox')) as HTMLInputElement
            expect(checkbox.checked).toBe(false)
        })

        it('calls onChange handler when clicked', async () => {
            const user = userEvent.setup()
            renderWithProviders(<TestImageCheckbox studyId={studyId} checked={false} onChange={onChange} />)

            const checkbox = await screen.findByTestId('test-image-checkbox')
            await user.click(checkbox)
            expect(onChange).toHaveBeenCalledWith(true)
        })
    })
})
