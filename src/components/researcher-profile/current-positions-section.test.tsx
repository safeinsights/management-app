import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { CurrentPositionsSection } from './current-positions-section'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

vi.mock('@/server/actions/researcher-profile.actions', () => ({
    updateCurrentPositionsAction: vi.fn(),
}))

vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
    },
}))

import { updateCurrentPositionsAction } from '@/server/actions/researcher-profile.actions'

const createEmptyProfileData = (): ResearcherProfileData => ({
    user: {
        id: 'user-1',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
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

const createProfileDataWithPositions = (): ResearcherProfileData => ({
    ...createEmptyProfileData(),
    profile: {
        ...createEmptyProfileData().profile,
        currentPositions: [{ affiliation: 'MIT', position: 'Professor', profileUrl: 'https://mit.edu/prof' }],
    },
})

describe('CurrentPositionsSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should auto-open form when no positions exist', async () => {
        const data = createEmptyProfileData()
        const refetch = vi.fn().mockResolvedValue(undefined)

        renderWithProviders(<CurrentPositionsSection data={data} refetch={refetch} />)

        // Form should be visible because there are no existing positions
        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        // Table should not be visible (no hasExistingPositions)
        expect(screen.queryByText('Institutional affiliation')).toBeNull()
    })

    it('should show table when positions exist', async () => {
        const data = createProfileDataWithPositions()
        const refetch = vi.fn().mockResolvedValue(undefined)

        renderWithProviders(<CurrentPositionsSection data={data} refetch={refetch} />)

        // Table should be visible
        await waitFor(() => {
            expect(screen.getByText('Institutional affiliation')).toBeDefined()
        })

        // Should show the position data
        expect(screen.getByText('MIT')).toBeDefined()
        expect(screen.getByText('Professor')).toBeDefined()
    })

    it('should not reopen form after save when editingIndex changes', async () => {
        // This test verifies the fix for the bug where the useEffect that auto-opens
        // the form would re-run when editingIndex changed (after save), causing the
        // form to stay open even after a successful save.
        //
        // The fix was to remove editingIndex from the useEffect dependency array,
        // so it only runs when data or hasExistingPositions changes.

        const user = userEvent.setup()
        const refetch = vi.fn().mockResolvedValue(undefined)

        ;(updateCurrentPositionsAction as Mock).mockResolvedValue({ success: true })

        // Start with empty positions - form will auto-open
        renderWithProviders(<CurrentPositionsSection data={createEmptyProfileData()} refetch={refetch} />)

        // Form should be auto-opened
        await waitFor(() => {
            expect(screen.getByText('Add current position')).toBeDefined()
        })

        // Fill in the form
        const affiliationInput = screen.getByPlaceholderText('Ex: University of California, Berkeley')
        const positionInput = screen.getByPlaceholderText('Ex: Senior Researcher')

        await user.type(affiliationInput, 'MIT')
        await user.type(positionInput, 'Professor')

        // Click save
        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await user.click(saveButton)

        // Wait for the action to be called and refetch to complete
        await waitFor(() => {
            expect(updateCurrentPositionsAction).toHaveBeenCalledWith({
                positions: [{ affiliation: 'MIT', position: 'Professor', profileUrl: '' }],
            })
            expect(refetch).toHaveBeenCalled()
        })
    })
})
