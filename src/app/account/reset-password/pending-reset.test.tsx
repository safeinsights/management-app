import { Routes } from '@/lib/routes'
import { keyGenerationUrl } from '@/lib/user-key-redirect'
import {
    advancesSignIn,
    clerkApiError,
    db,
    findFieldErrorShownOnce,
    fireEvent,
    getAuditEntries,
    insertKeylessInvitedUser,
    mockSignIn,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { flushDeferred } from '@/tests/vitest.setup'
import { useAuth } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { describe, expect, it, vi } from 'vitest'
import { PendingReset } from './pending-reset'

const VALID_PASSWORD = 'Passw0rd!'

const mockCompletedReset = (status = 'needs_first_factor') => {
    const signIn = mockSignIn({ status, identifier: 'ada@example.com' })
    signIn.resetPasswordEmailCode.verifyCode = advancesSignIn(signIn, 'needs_new_password')
    signIn.resetPasswordEmailCode.submitPassword = advancesSignIn(signIn, 'complete')
    ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })
    return signIn
}

const submitReset = async () => {
    renderWithProviders(<PendingReset identifier="ada@example.com" />)

    await userEvent.type(screen.getByLabelText('Verification code'), '123456')
    await userEvent.type(screen.getByLabelText('New password'), VALID_PASSWORD)
    await userEvent.type(screen.getByLabelText('Confirm New password'), VALID_PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
}

// A completed reset hands back a live session, so this screen is a sign-in like any other. It used
// to push straight at redirect_url, skipping the invite, the key detour and the login record.
describe('PendingReset', () => {
    it('routes a keyless user through key generation once the reset completes', async () => {
        const { user } = await insertKeylessInvitedUser()
        memoryRouter.setCurrentUrl('/account/reset-password?redirect_url=%2Fopenstax-lab%2Fdashboard')
        const signIn = mockCompletedReset()

        await submitReset()

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent('/openstax-lab/dashboard')}`,
            ),
        )
        expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({ code: '123456' })
        expect(signIn.finalize).toHaveBeenCalledOnce()

        // Neither implies the other: the reset is what the user did, the login is what they now hold.
        await flushDeferred()
        const events = (await getAuditEntries(user.id, 'USER')).map((entry) => entry.eventType)
        expect(events).toContain('RESET_PASSWORD')
        expect(events).toContain('LOGGED_IN')
    })

    it('accepts a pending invite before sending the user on', async () => {
        const { user, invitingOrg, invite } = await insertKeylessInvitedUser()
        memoryRouter.setCurrentUrl(`/account/reset-password?invite_id=${invite.id}`)
        mockCompletedReset()

        await submitReset()

        // The join writes the membership partway through the mutation, so waiting on the row alone
        // returns while the rest of the flow still runs. The landing is what closes it.
        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(keyGenerationUrl(Routes.orgDashboard({ orgSlug: invitingOrg.slug }))),
        )

        const membership = await db
            .selectFrom('orgUser')
            .select('id')
            .where('userId', '=', user.id)
            .where('orgId', '=', invitingOrg.id)
            .executeTakeFirst()
        expect(membership).toBeDefined()
    })

    it('shows a confirm password error one time, with the error icon', async () => {
        mockCompletedReset()
        renderWithProviders(<PendingReset identifier="ada@example.com" />)

        await userEvent.type(screen.getByLabelText('New password'), VALID_PASSWORD)
        await userEvent.type(screen.getByLabelText('Confirm New password'), `${VALID_PASSWORD}x`)
        await userEvent.tab()

        await findFieldErrorShownOnce('Passwords do not match. Please re-enter them.')
    })

    it('shows the incorrect-code message when Clerk rejects the verification code', async () => {
        const signIn = mockCompletedReset()
        signIn.resetPasswordEmailCode.verifyCode = vi
            .fn()
            .mockResolvedValue(clerkApiError('form_code_incorrect', 'Incorrect code'))

        await submitReset()

        expect(await screen.findByText('Incorrect verification code. Please try again.')).toBeInTheDocument()
        expect(signIn.resetPasswordEmailCode.submitPassword).not.toHaveBeenCalled()
    })

    // A rejected new password leaves the code verified; sending it again would fail as already used.
    it('submits only the new password when the code was verified by an earlier attempt', async () => {
        await insertKeylessInvitedUser()
        const signIn = mockCompletedReset('needs_new_password')

        await submitReset()

        await waitFor(() => expect(signIn.finalize).toHaveBeenCalledOnce())
        expect(signIn.resetPasswordEmailCode.verifyCode).not.toHaveBeenCalled()
        expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({
            password: VALID_PASSWORD,
            signOutOfOtherSessions: false,
        })
    })

    it('resends the code to the stored identifier', async () => {
        const signIn = mockCompletedReset()
        renderWithProviders(<PendingReset identifier="ada@example.com" />)

        fireEvent.click(screen.getByRole('button', { name: /resend verification code/i }))

        await waitFor(() => expect(signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledOnce())
    })
})
