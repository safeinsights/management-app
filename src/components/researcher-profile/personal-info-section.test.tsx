import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { PersonalInfoSection } from './personal-info-section'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

vi.mock('@/server/actions/researcher-profile.actions', () => ({
    updatePersonalInfoAction: vi.fn(),
}))

vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
    },
}))

import { updatePersonalInfoAction } from '@/server/actions/researcher-profile.actions'
import { notifications } from '@mantine/notifications'

const createProfileData = (): ResearcherProfileData => ({
    user: {
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
    },
    profile: {
        userId: 'user-1',
        educationInstitution: null,
        educationDegree: null,
        educationFieldOfStudy: null,
        educationIsCurrentlyPursuing: false,
        currentPositions: [],
        researchInterests: [],
        detailedPublicationsUrl: null,
        featuredPublicationsUrls: [],
    },
})

describe('PersonalInfoSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should display user data in view mode', async () => {
        const data = createProfileData()
        const refetch = vi.fn().mockResolvedValue(undefined)

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('John')).toBeDefined()
        })
        expect(screen.getByText('Doe')).toBeDefined()
        expect(screen.getByText('john.doe@example.com')).toBeDefined()
    })

    it('should switch to edit mode and pre-populate form', async () => {
        const user = userEvent.setup()
        const data = createProfileData()
        const refetch = vi.fn().mockResolvedValue(undefined)

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await user.click(editButton)

        await waitFor(() => {
            const firstNameInput = screen.getByPlaceholderText('Enter your first name') as HTMLInputElement
            const lastNameInput = screen.getByPlaceholderText('Enter your last name') as HTMLInputElement
            expect(firstNameInput.value).toBe('John')
            expect(lastNameInput.value).toBe('Doe')
        })
    })

    it('should save name changes and show success notification', async () => {
        const user = userEvent.setup()
        const data = createProfileData()
        const refetch = vi.fn().mockResolvedValue(undefined)
        ;(updatePersonalInfoAction as Mock).mockResolvedValue({ success: true })

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await user.click(editButton)

        const firstNameInput = screen.getByPlaceholderText('Enter your first name')
        const lastNameInput = screen.getByPlaceholderText('Enter your last name')

        await user.clear(firstNameInput)
        await user.clear(lastNameInput)
        await user.type(firstNameInput, 'Jane')
        await user.type(lastNameInput, 'Smith')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await user.click(saveButton)

        await waitFor(() => {
            expect(updatePersonalInfoAction).toHaveBeenCalledWith({
                firstName: 'Jane',
                lastName: 'Smith',
            })
            expect(refetch).toHaveBeenCalled()
            expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved', color: 'green' }))
        })
    })

    it('should show error notification on save failure', async () => {
        const user = userEvent.setup()
        const data = createProfileData()
        const refetch = vi.fn().mockResolvedValue(undefined)
        ;(updatePersonalInfoAction as Mock).mockRejectedValue(new Error('Network error'))

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await user.click(editButton)

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await user.click(saveButton)

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Save failed', color: 'red' }),
            )
        })
    })

    it('should show email as disabled in edit mode', async () => {
        const user = userEvent.setup()
        const data = createProfileData()
        const refetch = vi.fn().mockResolvedValue(undefined)

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await user.click(editButton)

        await waitFor(() => {
            const emailInput = screen.getByPlaceholderText('you@university.edu') as HTMLInputElement
            expect(emailInput.disabled).toBe(true)
            expect(emailInput.value).toBe('john.doe@example.com')
        })
    })
})
