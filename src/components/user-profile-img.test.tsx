import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'
import { UserProfileImage } from '@/components/user-profile-img'

// Mock the Mantine Avatar component with proper TypeScript typing
vi.mock('@mantine/core', () => ({
    Avatar: ({ src, alt }: { src?: string; alt?: string }) => (
        <img data-testid="avatar-component" src={src} alt={alt} />
    ),
}))

describe('UserProfileImage', () => {
    it('displays the user profile image when logged in', async () => {
        vi.mocked(useUser).mockReturnValue({
            user: {
                profileImageUrl: 'https://example.com/profile.jpg',
            },
        } as UseUserReturn)

        renderWithProviders(<UserProfileImage />)

        const avatar = screen.getByTestId('avatar-component')
        expect(avatar).toBeDefined()
        expect(avatar.getAttribute('src')).toBe('https://example.com/profile.jpg')
        expect(avatar.getAttribute('alt')).toBe('User profile')
    })

    it('returns null when not logged in', async () => {
        vi.mocked(useUser).mockReturnValue({
            user: null,
        } as UseUserReturn)

        const { container } = render(<UserProfileImage />)

        await waitFor(() => {
            expect(container.childElementCount).toEqual(0)
        })
    })
})
