import {
    db,
    insertKeylessInvitedUser,
    renderWithProviders,
    screen,
    fireEvent,
    mockSessionWithTestData,
    waitFor,
    userEvent,
    type Mock,
} from '@/tests/unit.helpers'
import { describe, it, expect, vi } from 'vitest'
import { useAuth, useSignIn } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { clerkErrorOverrides } from '@/lib/errors'
import { SignInForm } from './sign-in-form'

const mockSignInCreate = (create: Mock) =>
    (useSignIn as Mock).mockReturnValue({ isLoaded: true, signIn: { create }, setActive: vi.fn() })

// No-MFA counterpart: sign-in completes in one step, so the key detour applies here (OTTER-655).
const keylessUserSigningIn = async () => {
    const { user } = await mockSessionWithTestData({ orgType: 'lab' })
    await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
    ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })
    mockSignInCreate(vi.fn().mockResolvedValue({ status: 'complete', createdSessionId: 'session-id' }))
}

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

    it('carries an explicit redirect_url through key generation for a keyless user', async () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax-lab%2Fdashboard')
        await keylessUserSigningIn()

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent('/openstax-lab/dashboard')}`,
            ),
        )
    })

    // Emitting the fallback as a parameter would pin the key page to "My dashboard".
    it('sends a keyless user with no destination to a bare key page', async () => {
        memoryRouter.setCurrentUrl('/account/signin')
        await keylessUserSigningIn()

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() => expect(memoryRouter.asPath).toBe('/account/keys'))
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

    // A blank email fails both `min(1)` and `email()`; the resolver keeps the last by default,
    // so an untouched field read "Invalid email" (OTTER-647).
    it('says the email is required when it is left blank, not that it is invalid', async () => {
        mockSignInCreate(vi.fn())
        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)

        await userEvent.click(screen.getByLabelText('Email'))
        await userEvent.tab()

        expect(await screen.findByText('Email is required')).toBeInTheDocument()
        expect(screen.queryByText('Invalid email')).not.toBeInTheDocument()
    })

    it('still says the email is invalid when it is malformed', async () => {
        mockSignInCreate(vi.fn())
        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)

        await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
        await userEvent.tab()

        expect(await screen.findByText('Invalid email')).toBeInTheDocument()
    })

    // Mantine renders PasswordInput's inner <input> with ARIA wiring disabled (OTTER-647).
    it('marks the password input invalid when it is left blank', async () => {
        mockSignInCreate(vi.fn())
        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)

        const password = screen.getByLabelText('Password')
        expect(password).not.toHaveAttribute('aria-invalid')

        await userEvent.click(password)
        await userEvent.tab()

        await waitFor(() => expect(password).toHaveAttribute('aria-invalid', 'true'))
    })
    // An invited user who has not enrolled MFA completes sign-in in one step and lands here, where
    // invite_id used to be ignored — so the invite that brought them was silently lost.
    it('accepts a pending invite for a keyless user who signs in without MFA', async () => {
        const { user, invitingOrg, invite } = await insertKeylessInvitedUser()
        memoryRouter.setCurrentUrl(`/account/signin?invite_id=${invite.id}`)
        ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })
        mockSignInCreate(vi.fn().mockResolvedValue({ status: 'complete', createdSessionId: 'session-id' }))

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(async () => {
            const membership = await db
                .selectFrom('orgUser')
                .select('id')
                .where('userId', '=', user.id)
                .where('orgId', '=', invitingOrg.id)
                .executeTakeFirst()
            expect(membership).toBeDefined()
        })

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent(`/${invitingOrg.slug}/dashboard`)}`,
            ),
        )
    })
})
