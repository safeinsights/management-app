import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { EducationSection } from './education-section'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

vi.mock('@/server/actions/researcher-profile.actions', () => ({
    updateEducationAction: vi.fn(),
}))

vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
    },
}))

import { updateEducationAction } from '@/server/actions/researcher-profile.actions'
import { notifications } from '@mantine/notifications'

const createProfileDataWithEducation = (): ResearcherProfileData => ({
    user: {
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
    },
    profile: {
        userId: 'user-1',
        educationInstitution: 'MIT',
        educationDegree: 'Doctor of Philosophy (Ph.D.)',
        educationFieldOfStudy: 'Computer Science',
        educationIsCurrentlyPursuing: false,
        positions: [],
        researchInterests: [],
        detailedPublicationsUrl: null,
        featuredPublicationsUrls: [],
    },
})

const createProfileDataCurrentlyPursuing = (): ResearcherProfileData => ({
    ...createProfileDataWithEducation(),
    profile: {
        ...createProfileDataWithEducation().profile,
        educationIsCurrentlyPursuing: true,
    },
})

describe('EducationSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should display education data in view mode', async () => {
        const data = createProfileDataWithEducation()
        const refetch = vi.fn().mockResolvedValue(undefined)

        renderWithProviders(<EducationSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })
        expect(screen.getByText('Doctor of Philosophy (Ph.D.)')).toBeDefined()
        expect(screen.getByText('Computer Science')).toBeDefined()
    })

    it('should show "currently pursuing" label when checkbox was checked', async () => {
        const data = createProfileDataCurrentlyPursuing()
        const refetch = vi.fn().mockResolvedValue(undefined)

        renderWithProviders(<EducationSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('Degree (currently pursuing)')).toBeDefined()
        })
    })

    it('should save education changes', async () => {
        const user = userEvent.setup()
        const data = createProfileDataWithEducation()
        const refetch = vi.fn().mockResolvedValue(undefined)
        ;(updateEducationAction as Mock).mockResolvedValue({ success: true })

        renderWithProviders(<EducationSection data={data} refetch={refetch} />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await user.click(editButton)

        const institutionInput = screen.getByPlaceholderText('Ex: Rice University')
        await user.clear(institutionInput)
        await user.type(institutionInput, 'Stanford University')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await user.click(saveButton)

        await waitFor(() => {
            expect(updateEducationAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    educationalInstitution: 'Stanford University',
                }),
            )
            expect(refetch).toHaveBeenCalled()
            expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved', color: 'green' }))
        })
    })
})
