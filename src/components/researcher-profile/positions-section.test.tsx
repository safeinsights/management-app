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
import { PositionsSection } from './positions-section'

describe('PositionsSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should auto-open form when no positions exist', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        // Form should be visible because there are no existing positions
        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        // Table should not be visible (no hasExistingPositions)
        expect(screen.queryByText('Institutional affiliation')).toBeNull()
    })

    it('should show table when positions exist', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [
                {
                    affiliation: 'MIT',
                    position: 'Professor',
                    profileUrl: 'https://mit.edu/prof',
                },
            ],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        // Table should be visible
        await waitFor(() => {
            expect(screen.getByText('Institutional affiliation')).toBeDefined()
        })

        // Should show the position data
        expect(screen.getByText('MIT')).toBeDefined()
        expect(screen.getByText('Professor')).toBeDefined()
    })

    it('should save new position to database', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        // Form should be auto-opened
        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        // Fill in the form
        const affiliationInput = screen.getByPlaceholderText('Ex: University of California, Berkeley')
        const positionInput = screen.getByPlaceholderText('Ex: Senior Researcher')

        await userEvents.type(affiliationInput, 'MIT')
        await userEvents.type(positionInput, 'Professor')

        // Click save
        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        // Wait for the action to complete
        await waitFor(() => {
            expect(refetch).toHaveBeenCalled()
        })

        // Verify DB was updated
        const positions = await db
            .selectFrom('researcherPosition')
            .select(['affiliation', 'position'])
            .where('userId', '=', user.id)
            .execute()

        expect(positions).toHaveLength(1)
        expect(positions[0].affiliation).toBe('MIT')
        expect(positions[0].position).toBe('Professor')
    })

    it('should allow deleting the last position and save empty array', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [
                {
                    affiliation: 'MIT',
                    position: 'Professor',
                },
            ],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        // Table should be visible with delete button
        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })

        // Click delete
        const deleteButton = screen.getByRole('button', { name: /delete current position/i })
        await userEvents.click(deleteButton)

        // Wait for the action to complete
        await waitFor(() => {
            expect(refetch).toHaveBeenCalled()
        })

        // Verify DB was updated - position should be deleted
        const positions = await db
            .selectFrom('researcherPosition')
            .select(['id'])
            .where('userId', '=', user.id)
            .execute()

        expect(positions).toHaveLength(0)
    })

    it('should not show cancel button when no positions exist', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        // Form should be visible
        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        // Cancel button should not be visible when there are no existing positions
        expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull()
    })

    it('should show cancel button when editing with existing positions', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [
                {
                    affiliation: 'MIT',
                    position: 'Professor',
                },
            ],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        // Table should be visible
        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })

        // Click edit to open form
        const editButton = screen.getByRole('button', { name: /edit current position/i })
        await userEvents.click(editButton)

        // Cancel button should be visible when editing with existing positions
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined()
        })
    })
})
