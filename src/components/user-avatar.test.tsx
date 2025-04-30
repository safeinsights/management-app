import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'
import { UserAvatar } from '@/components/user-avatar'

vi.mock('@mantine/core', () => ({
    Avatar: ({ src, alt }: { src?: string; alt?: string }) => (
        <img data-testid="avatar-component" src={src} alt={alt} />
    ),
}))

describe('UserAvatar', () => {
    it('displays the user profile image when logged in', async () => {
        vi.mocked(useUser).mockReturnValue({
            user: {
                profileImageUrl: 'https://example.com/profile.jpg',
            },
        } as UseUserReturn)

        renderWithProviders(<UserAvatar />)

        const avatar = screen.getByTestId('avatar-component')
        expect(avatar).toBeDefined()
        expect(avatar.getAttribute('src')).toBe('https://example.com/profile.jpg')
        expect(avatar.getAttribute('alt')).toBe('User profile')
    })

    it('returns null when not logged in', async () => {
        vi.mocked(useUser).mockReturnValue({
            user: null,
        } as UseUserReturn)

        const { container } = render(<UserAvatar />)

        await waitFor(() => {
            expect(container.childElementCount).toEqual(0)
        })
    })
})
