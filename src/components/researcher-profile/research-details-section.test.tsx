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
import { ResearchDetailsSection } from './research-details-section'

describe('ResearchDetailsSection', () => {

    describe('research interests pills', () => {
        it('should add interest pill on Enter key', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            await insertTestResearcherProfile({ userId: user.id })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const input = screen.getByPlaceholderText('Type a research interest and press enter')
            await userEvents.type(input, 'Machine Learning{Enter}')

            await waitFor(() => {
                expect(screen.getByText('Machine Learning')).toBeDefined()
            })
        })

        it('should prevent adding more than 5 interests', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            // Include detailedPublicationsUrl so profile is "complete" and starts in view mode
            await insertTestResearcherProfile({
                userId: user.id,
                researchDetails: {
                    interests: ['AI', 'ML', 'Data Science', 'NLP', 'Computer Vision'],
                    detailedPublicationsUrl: 'https://scholar.google.com/user',
                },
            })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            // Click edit to enter edit mode
            const editButton = screen.getByRole('button', { name: /edit/i })
            await userEvents.click(editButton)

            await waitFor(() => {
                const input = screen.getByPlaceholderText(
                    'Type a research interest and press enter',
                ) as HTMLInputElement
                expect(input.disabled).toBe(true)
            })
        })

        it('should remove interest pill when clicking remove button', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            await insertTestResearcherProfile({
                userId: user.id,
                researchDetails: {
                    interests: ['Machine Learning', 'Data Science'],
                    detailedPublicationsUrl: 'https://scholar.google.com/user',
                },
            })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const editButton = screen.getByRole('button', { name: /edit/i })
            await userEvents.click(editButton)

            await waitFor(() => {
                expect(screen.getByText('Machine Learning')).toBeDefined()
            })

            // Find and click the remove button on the first pill (Mantine marks these as aria-hidden)
            const firstPill = screen.getByText('Machine Learning').closest('.mantine-Pill-root')
            const removeButton = firstPill?.querySelector('.mantine-Pill-remove') as HTMLElement
            await userEvents.click(removeButton)

            await waitFor(() => {
                expect(screen.queryByText('Machine Learning')).toBeNull()
            })
            expect(screen.getByText('Data Science')).toBeDefined()
        })

        it('should prevent duplicate interests (case-insensitive)', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            await insertTestResearcherProfile({ userId: user.id })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const input = screen.getByPlaceholderText('Type a research interest and press enter')

            // Add first interest
            await userEvents.type(input, 'Machine Learning{Enter}')
            await waitFor(() => {
                expect(screen.getByText('Machine Learning')).toBeDefined()
            })

            // Try to add duplicate with different case
            await userEvents.type(input, 'machine learning{Enter}')

            // Should still only have one pill
            await waitFor(() => {
                const pills = screen.getAllByText(/machine learning/i)
                expect(pills.length).toBe(1)
            })
        })
    })

    it('should save research details', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

        // Add an interest
        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'AI Research{Enter}')

        // Fill in required URL
        const urlInput = screen.getByPlaceholderText('https://scholar.google.com/user...')
        await userEvents.type(urlInput, 'https://scholar.google.com/citations?user=abc123')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(refetch).toHaveBeenCalled()
        })

        // Verify DB was updated
        const updated = await db
            .selectFrom('researcherProfile')
            .select(['researchInterests', 'detailedPublicationsUrl'])
            .where('userId', '=', user.id)
            .executeTakeFirstOrThrow()

        expect(updated.researchInterests).toEqual(['AI Research'])
        expect(updated.detailedPublicationsUrl).toBe('https://scholar.google.com/citations?user=abc123')
    })
})
