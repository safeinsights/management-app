import { renderWithProviders, screen, fireEvent, waitFor, userEvent, type Mock } from '@/tests/unit.helpers'
import { describe, it, expect, vi } from 'vitest'
import { useSignIn } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { clerkErrorOverrides } from '@/lib/errors'
import { SignInForm } from './sign-in-form'

const mockSignInCreate = (create: Mock) =>
    (useSignIn as Mock).mockReturnValue({ isLoaded: true, signIn: { create }, setActive: vi.fn() })

const submitCredentials = async () => {
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'whatever')
    fireEvent.click(screen.getByRole('button', { name: /login/i }))
}

describe('SignInForm', () => {
    it('redirects instead of erroring when Clerk reports an active session on submit', async () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fdashboard')
        const create = vi.fn().mockRejectedValue({
            errors: [
                { code: 'session_exists', message: 'Session already exists', longMessage: "You're already signed in." },
            ],
        })
        mockSignInCreate(create)

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() => expect(memoryRouter.asPath).toBe('/dashboard'))
    })

    // OTTER-671: with no redirect_url present, the post-signin landing is the dashboard.
    it('falls back to the dashboard when no redirect_url is present', async () => {
        memoryRouter.setCurrentUrl('/account/signin')
        const create = vi.fn().mockRejectedValue({
            errors: [
                { code: 'session_exists', message: 'Session already exists', longMessage: "You're already signed in." },
            ],
        })
        mockSignInCreate(create)

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() => expect(memoryRouter.asPath).toBe('/dashboard'))
    })

    it('shows a field error for incorrect credentials', async () => {
        memoryRouter.setCurrentUrl('/account/signin')
        const create = vi.fn().mockRejectedValue({
            errors: [{ code: 'form_password_incorrect', message: 'Password is incorrect.' }],
        })
        mockSignInCreate(create)

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() => expect(screen.getByText(clerkErrorOverrides.form_password_incorrect)).toBeInTheDocument())
        expect(memoryRouter.asPath).toBe('/account/signin')
    })
})
