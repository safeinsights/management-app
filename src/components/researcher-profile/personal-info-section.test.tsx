import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import {
    renderWithProviders,
    userEvent,
    mockSessionWithTestData,
    insertTestResearcherProfile,
    getTestResearcherProfileData,
    db,
} from '@/tests/unit.helpers'
import { PersonalInfoSection } from './personal-info-section'

vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
    },
}))

// Keep Clerk mock - it's an external service
vi.mock('@/server/clerk', () => ({
    updateClerkUserName: vi.fn().mockResolvedValue(undefined),
}))

import { notifications } from '@mantine/notifications'

describe('PersonalInfoSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should display user data in view mode', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText(user.firstName)).toBeDefined()
        })
        expect(screen.getByText(user.lastName!)).toBeDefined()
        expect(screen.getByText(user.email!)).toBeDefined()
    })

    it('should switch to edit mode and pre-populate form', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await userEvents.click(editButton)

        await waitFor(() => {
            const firstNameInput = screen.getByPlaceholderText('Enter your first name') as HTMLInputElement
            const lastNameInput = screen.getByPlaceholderText('Enter your last name') as HTMLInputElement
            expect(firstNameInput.value).toBe(user.firstName)
            expect(lastNameInput.value).toBe(user.lastName)
        })
    })

    it('should save name changes and show success notification', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await userEvents.click(editButton)

        const firstNameInput = screen.getByPlaceholderText('Enter your first name')
        const lastNameInput = screen.getByPlaceholderText('Enter your last name')

        await userEvents.clear(firstNameInput)
        await userEvents.clear(lastNameInput)
        await userEvents.type(firstNameInput, 'Jane')
        await userEvents.type(lastNameInput, 'Smith')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved', color: 'green' }))
            expect(refetch).toHaveBeenCalled()
        })

        // Verify DB was updated
        const updated = await db
            .selectFrom('user')
            .select(['firstName', 'lastName'])
            .where('id', '=', user.id)
            .executeTakeFirstOrThrow()

        expect(updated.firstName).toBe('Jane')
        expect(updated.lastName).toBe('Smith')
    })

    it('should show error notification on save failure', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        // Make Clerk mock throw error
        const { updateClerkUserName } = await import('@/server/clerk')
        vi.mocked(updateClerkUserName).mockRejectedValueOnce(new Error('Network error'))

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await userEvents.click(editButton)

        const firstNameInput = screen.getByPlaceholderText('Enter your first name')
        await userEvents.clear(firstNameInput)
        await userEvents.type(firstNameInput, 'Jane')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Save failed', color: 'red' }),
            )
        })
    })

    it('should show email as disabled in edit mode', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await userEvents.click(editButton)

        await waitFor(() => {
            const emailInput = screen.getByPlaceholderText('you@university.edu') as HTMLInputElement
            expect(emailInput.disabled).toBe(true)
            expect(emailInput.value).toBe(user.email)
        })
    })

    it('should close edit mode without API call when no changes are made', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        const originalFirstName = user.firstName

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PersonalInfoSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await userEvents.click(editButton)

        await waitFor(() => {
            expect(screen.getByPlaceholderText('Enter your first name')).toBeDefined()
        })

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(screen.getByText(originalFirstName)).toBeDefined()
        })

        // refetch should not be called when no changes were made
        expect(refetch).not.toHaveBeenCalled()
    })
})
