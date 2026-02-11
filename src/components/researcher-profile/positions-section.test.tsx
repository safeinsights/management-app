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
import { PositionsSection } from './positions-section'

describe('PositionsSection', () => {
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

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

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

    it('should add a second position via add link and save to DB', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [{ affiliation: 'MIT', position: 'Professor' }],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })

        const addLink = screen.getByText('+ Add another current position')
        await userEvents.click(addLink)

        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        const affiliationInput = screen.getByPlaceholderText('Ex: University of California, Berkeley')
        const positionInput = screen.getByPlaceholderText('Ex: Senior Researcher')

        await userEvents.type(affiliationInput, 'Stanford')
        await userEvents.type(positionInput, 'Researcher')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(refetch).toHaveBeenCalled()
        })

        const positions = await db
            .selectFrom('researcherPosition')
            .select(['affiliation', 'position'])
            .where('userId', '=', user.id)
            .orderBy('affiliation', 'asc')
            .execute()

        expect(positions).toHaveLength(2)
        expect(positions[0].affiliation).toBe('MIT')
        expect(positions[0].position).toBe('Professor')
        expect(positions[1].affiliation).toBe('Stanford')
        expect(positions[1].position).toBe('Researcher')
    })

    it('should hide delete button when only one position exists', async () => {
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

        // Delete button should not be visible when only one position exists
        expect(screen.queryByRole('button', { name: /delete current position/i })).toBeNull()
        // Delete column header should not be visible either
        expect(screen.queryByText('Delete')).toBeNull()
    })

    it('should show delete button and allow deletion when 2+ positions exist', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [
                {
                    affiliation: 'MIT',
                    position: 'Professor',
                },
                {
                    affiliation: 'Stanford',
                    position: 'Researcher',
                },
            ],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        // Table should be visible with both positions
        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
            expect(screen.getByText('Stanford')).toBeDefined()
        })

        // Delete column header should be visible
        expect(screen.getByText('Delete')).toBeDefined()

        // Delete buttons should be visible (2 positions = 2 delete buttons)
        const deleteButtons = screen.getAllByRole('button', { name: /delete current position/i })
        expect(deleteButtons).toHaveLength(2)

        // Click delete on the first position (MIT)
        await userEvents.click(deleteButtons[0])

        // Wait for the action to complete
        await waitFor(() => {
            expect(refetch).toHaveBeenCalled()
        })

        // Verify DB was updated - only one position should remain
        const positions = await db
            .selectFrom('researcherPosition')
            .select(['affiliation'])
            .where('userId', '=', user.id)
            .execute()

        expect(positions).toHaveLength(1)
        expect(positions[0].affiliation).toBe('Stanford')
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

    it('should hide edit and delete columns in read-only mode', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [
                {
                    affiliation: 'MIT',
                    position: 'Professor',
                },
                {
                    affiliation: 'Stanford',
                    position: 'Researcher',
                },
            ],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} readOnly />)

        // Table should be visible with position data
        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
            expect(screen.getByText('Stanford')).toBeDefined()
        })

        // Edit column header should not be visible
        expect(screen.queryByText('Edit')).toBeNull()
        // Delete column header should not be visible
        expect(screen.queryByText('Delete')).toBeNull()
        // Edit buttons should not be visible
        expect(screen.queryByRole('button', { name: /edit current position/i })).toBeNull()
        // Delete buttons should not be visible
        expect(screen.queryByRole('button', { name: /delete current position/i })).toBeNull()
    })

    it('should hide add position link in read-only mode', async () => {
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

        renderWithProviders(<PositionsSection data={data} refetch={refetch} readOnly />)

        // Table should be visible
        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })

        // "+ Add another current position" link should not be visible
        expect(screen.queryByText('+ Add another current position')).toBeNull()
    })

    it('should keep other rows visible when editing one of three positions', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [
                { affiliation: 'MIT', position: 'Professor' },
                { affiliation: 'Stanford', position: 'Researcher' },
                { affiliation: 'Harvard', position: 'Lecturer' },
            ],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('Stanford')).toBeDefined()
        })

        const editButtons = screen.getAllByRole('button', { name: /edit current position/i })
        await userEvents.click(editButtons[1])

        await waitFor(() => {
            expect(screen.getByText('Edit current position')).toBeDefined()
        })

        expect(screen.getByText('MIT')).toBeDefined()
        expect(screen.getByText('Harvard')).toBeDefined()

        const mitCell = screen.getByText('MIT').closest('td')
        const harvardCell = screen.getByText('Harvard').closest('td')
        expect(mitCell).toBeDefined()
        expect(harvardCell).toBeDefined()

        const affiliationInput = screen.getByPlaceholderText('Ex: University of California, Berkeley')
        expect(affiliationInput).toHaveValue('Stanford')
    })

    it('should edit an existing position and save to DB', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [{ affiliation: 'MIT', position: 'Professor' }],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })

        const editButton = screen.getByRole('button', { name: /edit current position/i })
        await userEvents.click(editButton)

        const affiliationInput = screen.getByPlaceholderText('Ex: University of California, Berkeley')
        await userEvents.clear(affiliationInput)
        await userEvents.type(affiliationInput, 'Harvard')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(refetch).toHaveBeenCalled()
        })

        const positions = await db
            .selectFrom('researcherPosition')
            .select(['affiliation', 'position'])
            .where('userId', '=', user.id)
            .execute()

        expect(positions).toHaveLength(1)
        expect(positions[0].affiliation).toBe('Harvard')
        expect(positions[0].position).toBe('Professor')
    })

    it('should disable edit, delete, and add buttons when editing a position', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [
                { affiliation: 'MIT', position: 'Professor' },
                { affiliation: 'Stanford', position: 'Researcher' },
            ],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })

        expect(screen.getByText('+ Add another current position')).toBeDefined()

        const editButtons = screen.getAllByRole('button', { name: /edit current position/i })
        await userEvents.click(editButtons[0])

        await waitFor(() => {
            expect(screen.getByText('Edit current position')).toBeDefined()
        })

        // Add link should not be visible while editing
        expect(screen.queryByText('+ Add another current position')).toBeNull()

        // The remaining edit button (for Stanford) should be data-disabled
        const remainingEditButton = screen.getByRole('button', { name: /edit current position/i })
        expect(remainingEditButton).toHaveAttribute('data-disabled')

        const deleteButtons = screen.getAllByRole('button', { name: /delete current position/i })
        for (const btn of deleteButtons) {
            expect(btn).toHaveAttribute('data-disabled')
        }
    })

    it('should disable edit, delete, and add buttons when adding a new position', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [
                { affiliation: 'MIT', position: 'Professor' },
                { affiliation: 'Stanford', position: 'Researcher' },
            ],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })

        const addLink = screen.getByText('+ Add another current position')
        await userEvents.click(addLink)

        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        // Add link should not be visible while adding
        expect(screen.queryByText('+ Add another current position')).toBeNull()

        // Edit buttons should be data-disabled
        const editButtons = screen.getAllByRole('button', { name: /edit current position/i })
        for (const btn of editButtons) {
            expect(btn).toHaveAttribute('data-disabled')
        }

        // Delete buttons should be data-disabled
        const deleteButtons = screen.getAllByRole('button', { name: /delete current position/i })
        for (const btn of deleteButtons) {
            expect(btn).toHaveAttribute('data-disabled')
        }
    })

    it('should re-enable buttons after canceling edit', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [
                { affiliation: 'MIT', position: 'Professor' },
                { affiliation: 'Stanford', position: 'Researcher' },
            ],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })

        const editButtons = screen.getAllByRole('button', { name: /edit current position/i })
        await userEvents.click(editButtons[0])

        await waitFor(() => {
            expect(screen.getByText('Edit current position')).toBeDefined()
        })

        const cancelButton = screen.getByRole('button', { name: /cancel/i })
        await userEvents.click(cancelButton)

        await waitFor(() => {
            expect(screen.getByText('+ Add another current position')).toBeDefined()
        })

        const editButtonsAfter = screen.getAllByRole('button', { name: /edit current position/i })
        for (const btn of editButtonsAfter) {
            expect(btn).not.toHaveAttribute('data-disabled')
        }

        const deleteButtonsAfter = screen.getAllByRole('button', { name: /delete current position/i })
        for (const btn of deleteButtonsAfter) {
            expect(btn).not.toHaveAttribute('data-disabled')
        }
    })

    it('should restore original values when canceling an edit', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [{ affiliation: 'MIT', position: 'Professor' }],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })

        const editButton = screen.getByRole('button', { name: /edit current position/i })
        await userEvents.click(editButton)

        const affiliationInput = screen.getByPlaceholderText('Ex: University of California, Berkeley')
        await userEvents.clear(affiliationInput)
        await userEvents.type(affiliationInput, 'Harvard')

        const cancelButton = screen.getByRole('button', { name: /cancel/i })
        await userEvents.click(cancelButton)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })
        expect(screen.queryByText('Harvard')).toBeNull()
        expect(screen.queryByText('Edit current position')).toBeNull()
    })

    it('should disable save button when profile URL is invalid', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        const affiliationInput = screen.getByPlaceholderText('Ex: University of California, Berkeley')
        const positionInput = screen.getByPlaceholderText('Ex: Senior Researcher')
        const profileUrlInput = screen.getByPlaceholderText('https://university.edu/faculty/yourname')

        await userEvents.type(affiliationInput, 'MIT')
        await userEvents.type(positionInput, 'Professor')
        await userEvents.type(profileUrlInput, 'not-a-valid-url')

        // Trigger validation by blurring the field
        await userEvents.tab()

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        expect(saveButton).toBeDisabled()
    })

    it('should remove empty row when canceling after clicking add', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [{ affiliation: 'MIT', position: 'Professor' }],
        })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<PositionsSection data={data} refetch={refetch} />)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })

        const addLink = screen.getByText('+ Add another current position')
        await userEvents.click(addLink)

        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        const cancelButton = screen.getByRole('button', { name: /cancel/i })
        await userEvents.click(cancelButton)

        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })
        expect(screen.queryByText('Add current position')).toBeNull()

        const rows = screen.getAllByRole('row')
        // 1 header + 1 data row
        expect(rows).toHaveLength(2)
    })
})
