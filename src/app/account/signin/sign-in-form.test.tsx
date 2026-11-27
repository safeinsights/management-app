import {
    advancesSignIn,
    clerkApiError,
    db,
    findFieldErrorShownOnce,
    insertKeylessInvitedUser,
    renderWithProviders,
    screen,
    fireEvent,
    mockSessionWithTestData,
    mockSignIn,
    waitFor,
    userEvent,
    type Mock,
} from '@/tests/unit.helpers'
import { describe, it, expect, vi } from 'vitest'
import { notifications } from '@mantine/notifications'
import { useAuth } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { clerkErrorOverrides } from '@/lib/errors'
import { SignInForm } from './sign-in-form'

const SESSION_EXISTS = clerkApiError('session_exists', 'Session already exists', "You're already signed in.")

const mockCompletedSignIn = () => {
    const signIn = mockSignIn()
    signIn.password = advancesSignIn(signIn, 'complete')
    return signIn
}

// No-MFA counterpart: sign-in completes in one step, so the key detour applies here (OTTER-655).
const keylessUserSigningIn = async () => {
    const { user } = await mockSessionWithTestData({ orgType: 'lab' })
    await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
    ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })
    return mockCompletedSignIn()
}

// The already-signed-in exit is a full load, so the root layout re-renders with the session's orgs.
const spyOnHardNavigation = () => vi.spyOn(window.location, 'replace').mockImplementation(() => {})

const submitCredentials = async () => {
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'whatever')
    fireEvent.click(screen.getByRole('button', { name: /login/i }))
}

describe('SignInForm', () => {
    it('tells a user signed out after setting up MFA to sign in with it', async () => {
        memoryRouter.setCurrentUrl('/account/signin?mfa=verify')

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)

        expect(await screen.findByText('MFA is set up')).toBeDefined()
    })

    it('redirects instead of erroring when Clerk reports an active session on submit', async () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fdashboard')
        mockSignIn({ password: vi.fn().mockResolvedValue(SESSION_EXISTS) })
        const replace = spyOnHardNavigation()

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
    })

    // OTTER-745: reportError ran before the session_exists branch, so the redirect the test above
    // asserts arrived behind a red "Failed Signin Attempt" toast.
    it('does not report an error when it redirects an already-signed-in submit', async () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fdashboard')
        mockSignIn({ password: vi.fn().mockResolvedValue(SESSION_EXISTS) })
        const replace = spyOnHardNavigation()

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
        expect(notifications.show).not.toHaveBeenCalled()
    })

    // OTTER-671: with no redirect_url present, the post-signin landing is the dashboard.
    it('falls back to the dashboard when no redirect_url is present', async () => {
        memoryRouter.setCurrentUrl('/account/signin')
        mockSignIn({ password: vi.fn().mockResolvedValue(SESSION_EXISTS) })
        const replace = spyOnHardNavigation()

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
    })

    it('carries an explicit redirect_url through key generation for a keyless user', async () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax-lab%2Fdashboard')
        const signIn = await keylessUserSigningIn()

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent('/openstax-lab/dashboard')}`,
            ),
        )
        expect(signIn.password).toHaveBeenCalledWith({ identifier: 'ada@example.com', password: 'whatever' })
        expect(signIn.finalize).toHaveBeenCalledOnce()
    })

    it('moves to the MFA step when the password is right and a second factor is pending', async () => {
        memoryRouter.setCurrentUrl('/account/signin')
        const signIn = mockSignIn()
        signIn.password = advancesSignIn(signIn, 'needs_second_factor')
        const onComplete = vi.fn()

        renderWithProviders(<SignInForm mfa={false} onComplete={onComplete} />)
        await submitCredentials()

        await waitFor(() => expect(onComplete).toHaveBeenCalledWith(true))
        expect(signIn.finalize).not.toHaveBeenCalled()
    })

    it('shows the locked-account error Clerk returns', async () => {
        memoryRouter.setCurrentUrl('/account/signin')
        mockSignIn({
            password: vi
                .fn()
                .mockResolvedValue(clerkApiError('user_locked', 'Locked', 'Your account is locked. Try again later.')),
        })

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        expect(await screen.findByText('Account Locked')).toBeInTheDocument()
    })

    // Emitting the fallback as a parameter would pin the key page to "My studies".
    it('sends a keyless user with no destination to a bare key page', async () => {
        memoryRouter.setCurrentUrl('/account/signin')
        await keylessUserSigningIn()

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() => expect(memoryRouter.asPath).toBe('/account/keys'))
    })

    it('shows a field error for incorrect credentials', async () => {
        memoryRouter.setCurrentUrl('/account/signin')
        mockSignIn({
            password: vi.fn().mockResolvedValue(clerkApiError('form_password_incorrect', 'Password is incorrect.')),
        })

        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)
        await submitCredentials()

        await waitFor(() => expect(screen.getByText(clerkErrorOverrides.form_password_incorrect)).toBeInTheDocument())
        expect(memoryRouter.asPath).toBe('/account/signin')
        await findFieldErrorShownOnce(clerkErrorOverrides.form_password_incorrect)

        const email = screen.getByLabelText('Email')
        expect(email).toHaveAttribute('aria-invalid', 'true')
        expect(email).not.toHaveAttribute('aria-describedby')
    })

    // A blank email fails both `min(1)` and `email()`; the resolver keeps the last by default,
    // so an untouched field read "Invalid email" (OTTER-647).
    it('says the email is required when it is left blank, not that it is invalid', async () => {
        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)

        await userEvent.click(screen.getByLabelText('Email'))
        await userEvent.tab()

        await findFieldErrorShownOnce('Email is required')
        expect(screen.queryByText('Invalid email')).not.toBeInTheDocument()
    })

    it('still says the email is invalid when it is malformed', async () => {
        renderWithProviders(<SignInForm mfa={false} onComplete={vi.fn()} />)

        await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
        await userEvent.tab()

        expect(await screen.findByText('Invalid email')).toBeInTheDocument()
    })

    // Mantine renders PasswordInput's inner <input> with ARIA wiring disabled (OTTER-647).
    it('marks the password input invalid when it is left blank', async () => {
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
        mockCompletedSignIn()

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
