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
import { EducationSection } from './education-section'

vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
    },
}))

import { notifications } from '@mantine/notifications'

describe('EducationSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should display education data in view mode', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            education: {
                institution: 'MIT',
                degree: 'Doctor of Philosophy (Ph.D.)',
                fieldOfStudy: 'Computer Science',
            },
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<EducationSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })
        expect(screen.getByText('Doctor of Philosophy (Ph.D.)')).toBeDefined()
        expect(screen.getByText('Computer Science')).toBeDefined()
    })

    it('should show "currently pursuing" label when checkbox was checked', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            education: {
                institution: 'MIT',
                degree: 'Doctor of Philosophy (Ph.D.)',
                fieldOfStudy: 'Computer Science',
                isCurrentlyPursuing: true,
            },
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<EducationSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('Degree (currently pursuing)')).toBeDefined()
        })
    })

    it('should save education changes', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            education: {
                institution: 'MIT',
                degree: 'Doctor of Philosophy (Ph.D.)',
                fieldOfStudy: 'Computer Science',
            },
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<EducationSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await userEvents.click(editButton)

        const institutionInput = screen.getByPlaceholderText('Ex: Rice University')
        await userEvents.clear(institutionInput)
        await userEvents.type(institutionInput, 'Stanford University')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved', color: 'green' }))
            expect(refetch).toHaveBeenCalled()
        })

        // Verify DB was updated
        const updated = await db
            .selectFrom('researcherProfile')
            .select('educationInstitution')
            .where('userId', '=', user.id)
            .executeTakeFirstOrThrow()

        expect(updated.educationInstitution).toBe('Stanford University')
    })
})
