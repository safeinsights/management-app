import {
    db,
    fireEvent,
    getAuditEntries,
    insertKeylessInvitedUser,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { flushDeferred } from '@/tests/vitest.setup'
import { useAuth, useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { memoryRouter } from 'next-router-mock'
import { describe, expect, it, vi } from 'vitest'
import { PendingReset } from './pending-reset'

const VALID_PASSWORD = 'Passw0rd!'

const mockCompletedReset = () => {
    ;(useSignIn as Mock).mockReturnValue({
        isLoaded: true,
        setActive: vi.fn(),
        signIn: {
            attemptFirstFactor: vi.fn().mockResolvedValue({ status: 'complete', createdSessionId: 'session-id' }),
        },
    })
    ;(useAuth as Mock).mockReturnValue({ isLoaded: true, getToken: vi.fn() })
}

const submitReset = async () => {
    renderWithProviders(<PendingReset pendingReset={{} as SignInResource} />)

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
        mockCompletedReset()

        await submitReset()

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                `/account/keys?redirect_url=${encodeURIComponent('/openstax-lab/dashboard')}`,
            ),
        )

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

        await waitFor(async () => {
            const membership = await db
                .selectFrom('orgUser')
                .select('id')
                .where('userId', '=', user.id)
                .where('orgId', '=', invitingOrg.id)
                .executeTakeFirst()
            expect(membership).toBeDefined()
        })
    })
})
