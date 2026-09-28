import { renderWithProviders, screen, waitFor, type Mock } from '@/tests/unit.helpers'
import { describe, it, expect, vi } from 'vitest'
import { useAuth, useClerk, useSignIn, useUser } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'
import SigninPage from './page'

// Clerk's signOut ends the session for every tab, so a sign-out on load here also signed out
// whichever tab the user had just signed back into (OTTER-388).
const mockLiveSession = () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    ;(useClerk as Mock).mockReturnValue({ signOut, openUserProfile: vi.fn() })
    ;(useAuth as Mock).mockReturnValue({ isLoaded: true, userId: 'user_1', signOut, getToken: vi.fn() })
    ;(useUser as Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
        user: { primaryEmailAddress: { emailAddress: 'ada@example.com' } },
    })
    ;(useSignIn as Mock).mockReturnValue({ isLoaded: true, signIn: { create: vi.fn() }, setActive: vi.fn() })
    return signOut
}

describe('SigninPage', () => {
    it('does not end a live session when the sign-in page loads', async () => {
        memoryRouter.setCurrentUrl(Routes.accountSignin)
        const signOut = mockLiveSession()

        renderWithProviders(<SigninPage />)

        expect(await screen.findByRole('heading', { name: /already signed in/i })).toBeDefined()
        expect(screen.queryByLabelText('Email')).toBeNull()
        expect(signOut).not.toHaveBeenCalled()
    })

    it('does not end a live session when the sign-in page loads with a redirect_url', async () => {
        memoryRouter.setCurrentUrl(`${Routes.accountSignin}?redirect_url=%2F`)
        const signOut = mockLiveSession()
        const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {})

        renderWithProviders(<SigninPage />)

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
        expect(signOut).not.toHaveBeenCalled()
    })
})
