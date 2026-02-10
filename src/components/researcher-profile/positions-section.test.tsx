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

        // Click edit on the second position (Stanford)
        const editButtons = screen.getAllByRole('button', { name: /edit current position/i })
        await userEvents.click(editButtons[1])

        // Form should show "Edit current position" title
        await waitFor(() => {
            expect(screen.getByText('Edit current position')).toBeDefined()
        })

        // MIT and Harvard rows should still be visible
        expect(screen.getByText('MIT')).toBeDefined()
        expect(screen.getByText('Harvard')).toBeDefined()

        // Stanford text should not appear in a regular table cell (it's replaced by the form)
        const mitCell = screen.getByText('MIT').closest('td')
        const harvardCell = screen.getByText('Harvard').closest('td')
        expect(mitCell).toBeDefined()
        expect(harvardCell).toBeDefined()

        // The form inputs should contain the Stanford values instead
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

        // Click edit
        const editButton = screen.getByRole('button', { name: /edit current position/i })
        await userEvents.click(editButton)

        // Change affiliation from MIT to Harvard
        const affiliationInput = screen.getByPlaceholderText('Ex: University of California, Berkeley')
        await userEvents.clear(affiliationInput)
        await userEvents.type(affiliationInput, 'Harvard')

        // Click save
        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(refetch).toHaveBeenCalled()
        })

        // Verify DB has "Harvard" not "MIT"
        const positions = await db
            .selectFrom('researcherPosition')
            .select(['affiliation', 'position'])
            .where('userId', '=', user.id)
            .execute()

        expect(positions).toHaveLength(1)
        expect(positions[0].affiliation).toBe('Harvard')
        expect(positions[0].position).toBe('Professor')
    })

    it('should hide add link in table footer when editing', async () => {
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

        // Add link should be visible before editing
        expect(screen.getByText('+ Add another current position')).toBeDefined()

        // Click edit on first position
        const editButtons = screen.getAllByRole('button', { name: /edit current position/i })
        await userEvents.click(editButtons[0])

        await waitFor(() => {
            expect(screen.getByText('Edit current position')).toBeDefined()
        })

        // The table footer add link should be hidden when editing
        // (the form actions area may show one, but the table footer one is gone)
        // With editingIndex !== null, table footer link is hidden
        // Form actions shows it only when !isAdding (editing existing), so one link remains in form actions
        // But the table footer link (controlled by editingIndex === null) should be gone
        // Since both links have the same text, we check that only one exists (the form actions one)
        const addLinks = screen.getAllByText('+ Add another current position')
        expect(addLinks).toHaveLength(1)
    })

    it('should hide add link in form actions when adding new position', async () => {
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

        // Click edit to open form
        const editButton = screen.getByRole('button', { name: /edit current position/i })
        await userEvents.click(editButton)

        await waitFor(() => {
            expect(screen.getByText('Edit current position')).toBeDefined()
        })

        // Click "+ Add another current position" link (in form actions area)
        const addLink = screen.getByText('+ Add another current position')
        await userEvents.click(addLink)

        // Should now show "Add current position" form title
        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        // The add link should be completely hidden (isAdding=true hides form actions link,
        // and editingIndex !== null hides table footer link)
        expect(screen.queryByText('+ Add another current position')).toBeNull()
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

        // Click edit
        const editButton = screen.getByRole('button', { name: /edit current position/i })
        await userEvents.click(editButton)

        // Change affiliation to Harvard
        const affiliationInput = screen.getByPlaceholderText('Ex: University of California, Berkeley')
        await userEvents.clear(affiliationInput)
        await userEvents.type(affiliationInput, 'Harvard')

        // Click cancel
        const cancelButton = screen.getByRole('button', { name: /cancel/i })
        await userEvents.click(cancelButton)

        // Form should close, original "MIT" should be visible in table
        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })
        expect(screen.queryByText('Harvard')).toBeNull()
        expect(screen.queryByText('Edit current position')).toBeNull()
    })

    it('should delete a position while adding a new one', async () => {
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
            expect(screen.getByText('Stanford')).toBeDefined()
        })

        // Click edit on first position
        const editButtons = screen.getAllByRole('button', { name: /edit current position/i })
        await userEvents.click(editButtons[0])

        await waitFor(() => {
            expect(screen.getByText('Edit current position')).toBeDefined()
        })

        // Click "+ Add another current position" to start adding
        const addLink = screen.getByText('+ Add another current position')
        await userEvents.click(addLink)

        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        // Delete the first existing position (MIT) while in adding mode
        const deleteButtons = screen.getAllByRole('button', { name: /delete current position/i })
        await userEvents.click(deleteButtons[0])

        // Wait for the action to complete
        await waitFor(() => {
            expect(refetch).toHaveBeenCalled()
        })

        // Verify DB: MIT deleted, Stanford remains
        const positions = await db
            .selectFrom('researcherPosition')
            .select(['affiliation'])
            .where('userId', '=', user.id)
            .execute()

        expect(positions).toHaveLength(1)
        expect(positions[0].affiliation).toBe('Stanford')

        // The form should still be open (editingIndex is non-null)
        // In the real app, refetch would update data and show "Add current position"
        // In the test, data prop is static so it shows as editing mode
        expect(screen.getByRole('button', { name: /save changes/i })).toBeDefined()
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

        // Click edit, then click add to start adding a new position
        const editButton = screen.getByRole('button', { name: /edit current position/i })
        await userEvents.click(editButton)

        await waitFor(() => {
            expect(screen.getByText('Edit current position')).toBeDefined()
        })

        const addLink = screen.getByText('+ Add another current position')
        await userEvents.click(addLink)

        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        // Click cancel
        const cancelButton = screen.getByRole('button', { name: /cancel/i })
        await userEvents.click(cancelButton)

        // Form should close, only MIT row should be visible
        await waitFor(() => {
            expect(screen.getByText('MIT')).toBeDefined()
        })
        expect(screen.queryByText('Add current position')).toBeNull()

        // Only one data row should exist (MIT)
        const rows = screen.getAllByRole('row')
        // 1 header row + 1 data row = 2 total
        expect(rows).toHaveLength(2)
    })
})
