import { describe, it, expect, vi } from 'vitest'
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
                const pillsInput = document.getElementById('researchInterests') as HTMLInputElement
                expect(pillsInput).toBeTruthy()
                expect(pillsInput.disabled).toBe(false)
                expect(pillsInput.placeholder).toBe('')
            })

            // Helper text should be hidden at the limit
            expect(screen.queryByText(/include up to five/i)).toBeNull()

            // Typing + Enter should not add a 6th pill
            const input = document.getElementById('researchInterests') as HTMLInputElement
            await userEvents.type(input, 'Robotics{Enter}')

            await waitFor(() => {
                expect(screen.queryByText('Robotics')).toBeNull()
            })
        })

        it('should block typing in input when at 5-pill limit', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

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

            const editButton = screen.getByRole('button', { name: /edit/i })
            await userEvents.click(editButton)

            const input = await waitFor(() => {
                const el = document.getElementById('researchInterests') as HTMLInputElement
                expect(el).toBeTruthy()
                return el
            })

            await userEvents.type(input, 'Robotics')

            expect(input.value).toBe('')
        })

        it('should allow backspace removal when at 5-pill limit', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

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

            const editButton = screen.getByRole('button', { name: /edit/i })
            await userEvents.click(editButton)

            await waitFor(() => {
                expect(screen.getByText('Computer Vision')).toBeDefined()
            })

            // Focus the input and press Backspace to remove the last pill
            const input = document.getElementById('researchInterests') as HTMLInputElement
            await userEvents.click(input)
            await userEvents.keyboard('{Backspace}')

            await waitFor(() => {
                expect(screen.queryByText('Computer Vision')).toBeNull()
            })

            // Other pills remain
            expect(screen.getByText('AI')).toBeDefined()
            expect(screen.getByText('NLP')).toBeDefined()
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

        it('should remove last interest pill on Backspace when input is empty', async () => {
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
                expect(screen.getByText('Data Science')).toBeDefined()
            })

            const input = screen.getByPlaceholderText('Type a research interest and press enter')
            await userEvents.click(input)
            await userEvents.keyboard('{Backspace}')

            await waitFor(() => {
                expect(screen.queryByText('Data Science')).toBeNull()
            })
            expect(screen.getByText('Machine Learning')).toBeDefined()
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
