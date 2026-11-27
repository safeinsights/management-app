import {
    advancesSignIn,
    clerkApiError,
    db,
    faker,
    insertKeylessInvitedUser,
    mockSessionWithTestData,
    mockSignIn,
    renderWithProviders,
    screen,
    testEmail,
    userEvent,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { readJoinedOrg } from '@/lib/joined-org'
import { useAuth, useUser } from '@clerk/nextjs'
import router from 'next-router-mock'
import { describe, expect, it, vi } from 'vitest'
import { RequestMFA } from './mfa'

const mockSecondFactor = () => {
    ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })
    // RequestMFA renders nothing once Clerk reports a live session; this challenge happens first.
    ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: false })

    const signIn = mockSignIn({ status: 'needs_second_factor', supportedSecondFactors: [{ strategy: 'totp' }] })
    signIn.mfa.verifyTOTP = advancesSignIn(signIn, 'complete')
    return signIn
}

const submitTotpCode = async () => {
    renderWithProviders(<RequestMFA mfa />)

    await userEvent.click(screen.getByRole('button', { name: /authenticator app verification/i }))
    await userEvent.type(await screen.findByLabelText('Digit 1 of 6'), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
}

describe('RequestMFA', () => {
    it('accepts a pending invite before sending a keyless user to key generation', async () => {
        const { user, invitingOrg, invite } = await insertKeylessInvitedUser()
        router.setCurrentUrl(`/account/signin?invite_id=${invite.id}`)

        mockSecondFactor()
        await submitTotpCode()

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
            expect(router.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent(`/${invitingOrg.slug}/dashboard`)}`,
            ),
        )

        // The layout keeps a keyless user off the dashboard (OTTER-743), so the flag must survive the
        // key detour.
        expect(readJoinedOrg()).toEqual({ orgName: invitingOrg.name })
    })

    // OTTER-788. The linking screen derives its own continuation from the claimed invite, so the
    // key detour forwards to a bare path and nothing has to survive a nested redirect_url.
    it('sends an invite addressed to another email through the linking screen', async () => {
        const { user, invitingOrg, invite } = await insertKeylessInvitedUser({ invitedEmail: testEmail() })
        router.setCurrentUrl(`/account/signin?invite_id=${invite.id}`)

        mockSecondFactor()
        await submitTotpCode()

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
            expect(router.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent(`/account/invitation/${invite.id}/link-email`)}`,
            ),
        )
    })

    // Without the actionResult wrapper a spent invite would look like a successful join.
    it('sends a keyless user to the join-team page when the invite no longer resolves', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const spentInvite = faker.string.uuid()
        router.setCurrentUrl(`/account/signin?invite_id=${spentInvite}`)

        mockSecondFactor()
        await submitTotpCode()

        await waitFor(() =>
            expect(router.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent(`/account/invitation/${spentInvite}/join-team`)}`,
            ),
        )
    })

    // Both parameters arrive together when an invite link is opened after a captured deep link;
    // pinned so a refactor cannot flip the order silently.
    it('prefers the invite landing over an explicit redirect_url when both are present', async () => {
        const { invitingOrg, invite } = await insertKeylessInvitedUser()
        router.setCurrentUrl(`/account/signin?invite_id=${invite.id}&redirect_url=%2Fopenstax-lab%2Fdashboard`)

        mockSecondFactor()
        await submitTotpCode()

        await waitFor(() =>
            expect(router.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent(`/${invitingOrg.slug}/dashboard`)}`,
            ),
        )
    })

    it('carries an explicit redirect_url through key generation', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        router.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax-lab%2Fdashboard')

        mockSecondFactor()
        await submitTotpCode()

        await waitFor(() =>
            expect(router.asPath).toBe(`/account/keys?redirect_url=${encodeURIComponent('/openstax-lab/dashboard')}`),
        )
    })

    it('sends a keyless user with no destination to a bare key page, so it resolves its own landing', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        router.setCurrentUrl('/account/signin')

        mockSecondFactor()
        await submitTotpCode()

        await waitFor(() => expect(router.asPath).toBe('/account/keys'))
    })

    it('sends a user who already holds a key straight to their destination', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        // insertTestUser only seeds a key for enclave orgs.
        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: Buffer.from('test-public-key'), fingerprint: 'test-fingerprint' })
            .execute()
        router.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax-lab%2Fdashboard')

        mockSecondFactor()
        await submitTotpCode()

        await waitFor(() => expect(router.asPath).toBe('/openstax-lab/dashboard'))
    })

    it('finalizes the session after a correct authenticator code', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })
        router.setCurrentUrl('/account/signin')
        const signIn = mockSecondFactor()

        await submitTotpCode()

        await waitFor(() => expect(signIn.finalize).toHaveBeenCalledOnce())
        expect(signIn.mfa.verifyTOTP).toHaveBeenCalledWith({ code: '123456' })
    })

    it('shows the wrong-code message and stays on the challenge', async () => {
        router.setCurrentUrl('/account/signin')
        const signIn = mockSecondFactor()
        signIn.mfa.verifyTOTP = vi.fn().mockResolvedValue(clerkApiError('form_code_incorrect', 'Incorrect code'))

        await submitTotpCode()

        expect(await screen.findByText('Invalid verification code. Please try again.')).toBeInTheDocument()
        expect(signIn.finalize).not.toHaveBeenCalled()
        expect(router.asPath).toBe('/account/signin')
    })

    it('sends an SMS code when the user picks SMS', async () => {
        ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })
        ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: false })
        const signIn = mockSignIn({
            status: 'needs_second_factor',
            supportedSecondFactors: [{ strategy: 'phone_code', safeIdentifier: '+•• ••• ••42' }],
        })
        renderWithProviders(<RequestMFA mfa />)

        await userEvent.click(screen.getByRole('button', { name: /sms verification/i }))

        expect(await screen.findByText(/phone number ending in ••42/)).toBeInTheDocument()
        expect(signIn.mfa.sendPhoneCode).toHaveBeenCalledOnce()

        await userEvent.click(screen.getByRole('button', { name: /resend code/i }))

        await waitFor(() => expect(signIn.mfa.sendPhoneCode).toHaveBeenCalledTimes(2))
    })
})
