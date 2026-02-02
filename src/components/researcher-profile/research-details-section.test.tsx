import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { ResearchDetailsSection } from './research-details-section'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

vi.mock('@/server/actions/researcher-profile.actions', () => ({
    updateResearchDetailsAction: vi.fn(),
}))

vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
    },
}))

import { updateResearchDetailsAction } from '@/server/actions/researcher-profile.actions'

const createEmptyProfileData = (): ResearcherProfileData => ({
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

const createProfileDataWithInterests = (interests: string[]): ResearcherProfileData => ({
    ...createEmptyProfileData(),
    profile: {
        ...createEmptyProfileData().profile,
        researchInterests: interests,
        detailedPublicationsUrl: 'https://scholar.google.com/user',
    },
})

describe('ResearchDetailsSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('research interests pills', () => {
        it('should add interest pill on Enter key', async () => {
            const user = userEvent.setup()
            const data = createEmptyProfileData()
            const refetch = vi.fn().mockResolvedValue(undefined)

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const input = screen.getByPlaceholderText('Type a research interest and press enter')
            await user.type(input, 'Machine Learning{Enter}')

            await waitFor(() => {
                expect(screen.getByText('Machine Learning')).toBeDefined()
            })
        })

        it('should prevent adding more than 5 interests', async () => {
            const user = userEvent.setup()
            const data = createProfileDataWithInterests(['AI', 'ML', 'Data Science', 'NLP', 'Computer Vision'])
            const refetch = vi.fn().mockResolvedValue(undefined)

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            // Click edit to enter edit mode
            const editButton = screen.getByRole('button', { name: /edit/i })
            await user.click(editButton)

            await waitFor(() => {
                const input = screen.getByPlaceholderText(
                    'Type a research interest and press enter',
                ) as HTMLInputElement
                expect(input.disabled).toBe(true)
            })
        })

        it('should remove interest pill when clicking remove button', async () => {
            const user = userEvent.setup()
            const data = createProfileDataWithInterests(['Machine Learning', 'Data Science'])
            const refetch = vi.fn().mockResolvedValue(undefined)

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const editButton = screen.getByRole('button', { name: /edit/i })
            await user.click(editButton)

            await waitFor(() => {
                expect(screen.getByText('Machine Learning')).toBeDefined()
            })

            // Find and click the remove button on the first pill (Mantine marks these as aria-hidden)
            const firstPill = screen.getByText('Machine Learning').closest('.mantine-Pill-root')
            const removeButton = firstPill?.querySelector('.mantine-Pill-remove') as HTMLElement
            await user.click(removeButton)

            await waitFor(() => {
                expect(screen.queryByText('Machine Learning')).toBeNull()
            })
            expect(screen.getByText('Data Science')).toBeDefined()
        })

        it('should prevent duplicate interests (case-insensitive)', async () => {
            const user = userEvent.setup()
            const data = createEmptyProfileData()
            const refetch = vi.fn().mockResolvedValue(undefined)

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const input = screen.getByPlaceholderText('Type a research interest and press enter')

            // Add first interest
            await user.type(input, 'Machine Learning{Enter}')
            await waitFor(() => {
                expect(screen.getByText('Machine Learning')).toBeDefined()
            })

            // Try to add duplicate with different case
            await user.type(input, 'machine learning{Enter}')

            // Should still only have one pill
            await waitFor(() => {
                const pills = screen.getAllByText(/machine learning/i)
                expect(pills.length).toBe(1)
            })
        })
    })

    it('should save research details', async () => {
        const user = userEvent.setup()
        const data = createEmptyProfileData()
        const refetch = vi.fn().mockResolvedValue(undefined)
        ;(updateResearchDetailsAction as Mock).mockResolvedValue({ success: true })

        renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

        // Add an interest
        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await user.type(interestInput, 'AI Research{Enter}')

        // Fill in required URL
        const urlInput = screen.getByPlaceholderText('https://scholar.google.com/user...')
        await user.type(urlInput, 'https://scholar.google.com/citations?user=abc123')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await user.click(saveButton)

        await waitFor(() => {
            expect(updateResearchDetailsAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    researchInterests: ['AI Research'],
                    detailedPublicationsUrl: 'https://scholar.google.com/citations?user=abc123',
                }),
            )
            expect(refetch).toHaveBeenCalled()
        })
    })
})
