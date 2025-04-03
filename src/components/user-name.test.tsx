import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'
import { UserName } from '@/components/user-name'

vi.mock('@clerk/nextjs', () => ({
    useUser: vi.fn(),
}))

describe('Username', () => {
    it('displays the users first name when logged in', async () => {
        vi.mocked(useUser).mockReturnValue({
            user: {
                firstName: 'Tester',
            },
        } as UseUserReturn)

        renderWithProviders(<UserName />)

        expect(screen.getByText(/Tester/i)).toBeDefined()
    })

    it('returns null when not logged in', async () => {
        vi.mocked(useUser).mockReturnValue({
            user: null,
        } as UseUserReturn)

        const { container } = render(<UserName />)

        await waitFor(() => {
            expect(container.childElementCount).toEqual(0)
        })
    })
})
