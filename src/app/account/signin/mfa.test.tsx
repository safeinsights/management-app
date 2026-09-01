import {
    db,
    faker,
    insertKeylessInvitedUser,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { JOINED_ORG_STORAGE_KEY } from '@/lib/joined-org'
import { useAuth, useSignIn, useUser } from '@clerk/nextjs'
import router from 'next-router-mock'
import { describe, expect, it, vi } from 'vitest'
import { RequestMFA } from './mfa'

const mockSecondFactor = () => {
    ;(useSignIn as Mock).mockReturnValue({ isLoaded: true, setActive: vi.fn() })
    ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })
    // RequestMFA renders nothing once Clerk reports a live session, which is the state the shared
    // session mock sets up; this challenge happens before the session exists.
    ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: false })

    return {
        signIn: {
            status: 'needs_second_factor',
            supportedSecondFactors: [{ strategy: 'totp' }],
            attemptSecondFactor: vi.fn().mockResolvedValue({ status: 'complete', createdSessionId: 'session-id' }),
            reload: vi.fn(),
        },
        usingSMS: false,
    }
}

const submitTotpCode = async (mfa: ReturnType<typeof mockSecondFactor>) => {
    renderWithProviders(<RequestMFA mfa={mfa as never} />)

    await userEvent.click(screen.getByRole('button', { name: /authenticator app verification/i }))
    await userEvent.type(await screen.findByLabelText('Digit 1 of 6'), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
}

describe('RequestMFA', () => {
    it('accepts a pending invite before sending a keyless user to key generation', async () => {
        const { user, invitingOrg, invite } = await insertKeylessInvitedUser()
        router.setCurrentUrl(`/account/signin?invite_id=${invite.id}`)

        await submitTotpCode(mockSecondFactor())

        // The membership is the point: the old early return skipped the join entirely.
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

        // The banner is deferred until the user is keyed (OTTER-639), so the flag has to survive
        // the key detour this branch routes them through.
        expect(sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)).toBe(invitingOrg.name)
    })

    // The invite branch reports failure by throwing out of actionResult; if that wrapper is ever
    // dropped, a spent invite would look like a successful join.
    it('sends a keyless user to the join-team page when the invite no longer resolves', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const spentInvite = faker.string.uuid()
        router.setCurrentUrl(`/account/signin?invite_id=${spentInvite}`)

        await submitTotpCode(mockSecondFactor())

        await waitFor(() =>
            expect(router.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent(`/account/invitation/${spentInvite}/join-team`)}`,
            ),
        )
    })

    // Both parameters arrive together whenever an invite link is opened after the proxy captured a
    // deep link. Pinning the order here so a later refactor cannot flip it silently.
    it('prefers the invite landing over an explicit redirect_url when both are present', async () => {
        const { invitingOrg, invite } = await insertKeylessInvitedUser()
        router.setCurrentUrl(`/account/signin?invite_id=${invite.id}&redirect_url=%2Fopenstax-lab%2Fdashboard`)

        await submitTotpCode(mockSecondFactor())

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

        await submitTotpCode(mockSecondFactor())

        await waitFor(() =>
            expect(router.asPath).toBe(`/account/keys?redirect_url=${encodeURIComponent('/openstax-lab/dashboard')}`),
        )
    })

    it('sends a keyless user with no destination to a bare key page, so it resolves its own landing', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        router.setCurrentUrl('/account/signin')

        await submitTotpCode(mockSecondFactor())

        await waitFor(() => expect(router.asPath).toBe('/account/keys'))
    })

    it('sends a user who already holds a key straight to their destination', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        // Stated explicitly: insertTestUser only seeds a key for enclave orgs.
        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: Buffer.from('test-public-key'), fingerprint: 'test-fingerprint' })
            .execute()
        router.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax-lab%2Fdashboard')

        await submitTotpCode(mockSecondFactor())

        await waitFor(() => expect(router.asPath).toBe('/openstax-lab/dashboard'))
    })
})
