import {
    advancesSignIn,
    clerkApiError,
    db,
    findFieldErrorShownOnce,
    fireEvent,
    insertKeylessInvitedUser,
    Mock,
    mockSessionWithTestData,
    mockSignIn,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { vi, describe, it, expect } from 'vitest'
import { RecoveryCodeSignIn } from './recovery-code-signin'
import { useAuth } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'

describe('RecoveryCodeSignIn', () => {
    it('successfully signs in with a recovery code and redirects to dashboard', async () => {
        // Stated explicitly: insertTestUser only seeds a key for enclave orgs, and a keyless user
        // would be diverted to key generation instead of the dashboard this asserts.
        await mockSessionWithTestData({ orgType: 'enclave' })
        ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })

        const signIn = mockSignIn({ status: 'needs_second_factor' })
        signIn.mfa.verifyBackupCode = advancesSignIn(signIn, 'complete')

        const setStep = vi.fn()
        renderWithProviders(<RecoveryCodeSignIn setStep={setStep} />)

        const input = screen.getByLabelText(/Enter recovery code/i)
        const submitBtn = screen.getByRole('button', { name: /Sign in/i })

        await userEvent.type(input, 'testcode123')
        fireEvent.click(submitBtn)

        await waitFor(() => {
            expect(signIn.mfa.verifyBackupCode).toHaveBeenCalledWith({ code: 'testcode123' })
            expect(signIn.finalize).toHaveBeenCalledOnce()
            expect(memoryRouter.asPath).toBe(Routes.dashboard)
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    'data-toast-kind': 'success',
                    title: expect.stringContaining('signed in using a recovery code'),
                }),
            )
        })
    })
    // This branch used to push straight to the dashboard, so an invited user reaching for a backup
    // code never joined the org.
    it('accepts a pending invite and routes a keyless user through key generation', async () => {
        const { user, invitingOrg, invite } = await insertKeylessInvitedUser()
        memoryRouter.setCurrentUrl(`/account/signin?invite_id=${invite.id}`)
        const signIn = mockSignIn({ status: 'needs_second_factor' })
        signIn.mfa.verifyBackupCode = advancesSignIn(signIn, 'complete')
        ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })

        renderWithProviders(<RecoveryCodeSignIn setStep={vi.fn()} />)

        await userEvent.type(screen.getByLabelText(/Enter recovery code/i), 'testcode123')
        fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))

        // The membership is the point: the old branch dropped invite_id entirely.
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

    it('shows a code error one time, with the error icon', async () => {
        renderWithProviders(<RecoveryCodeSignIn setStep={vi.fn()} />)

        const input = screen.getByLabelText(/Enter recovery code/i)
        await userEvent.type(input, 'not-valid!')
        await userEvent.tab()

        await findFieldErrorShownOnce('Only alphanumeric characters are allowed')
        expect(input).toHaveAttribute('aria-invalid', 'true')
    })

    it('shows the incorrect-code message one time when Clerk rejects the code', async () => {
        const signIn = mockSignIn({
            status: 'needs_second_factor',
            mfa: { verifyBackupCode: vi.fn().mockResolvedValue(clerkApiError('form_code_incorrect', 'Incorrect code')) },
        })
        renderWithProviders(<RecoveryCodeSignIn setStep={vi.fn()} />)

        await userEvent.type(screen.getByLabelText(/Enter recovery code/i), 'wrongcode123')
        fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))

        await findFieldErrorShownOnce('Code is incorrect or already in use. Please try another.')
        expect(signIn.finalize).not.toHaveBeenCalled()
    })
})
