import { describe, expect, it, vi, type Mock } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import {
    db,
    flushDeferred,
    getAuditEntries,
    getAuditEntriesWithMetadata,
    insertTestUser,
    mockSessionWithTestData,
    postHogCaptures,
} from '@/tests/unit.helpers'

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    flush: vi.fn(async () => true),
}))

const captureExceptionMock = Sentry.captureException as unknown as Mock
const flushMock = Sentry.flush as unknown as Mock

describe('deferred', () => {
    it('captures and flushes to Sentry when the handler rejects', async () => {
        const { deferred } = await import('./events')
        const boom = new Error('handler exploded')
        const run = deferred(async () => {
            throw boom
        })

        run()
        await flushDeferred()
        expect(captureExceptionMock).toHaveBeenCalledWith(boom)
        // Without the flush the event is dropped when the instance freezes after the response.
        expect(flushMock).toHaveBeenCalled()
    })

    it('does not report when the handler resolves', async () => {
        const { deferred } = await import('./events')
        const run = deferred(async () => undefined)

        run()
        await flushDeferred()
        expect(captureExceptionMock).not.toHaveBeenCalled()
        expect(flushMock).not.toHaveBeenCalled()
    })
})

describe('user event captures', () => {
    it('onUserLogIn captures user_logged_in for the user', async () => {
        const { onUserLogIn } = await import('./events')
        const { user } = await mockSessionWithTestData()

        onUserLogIn({ userId: user.id })

        await flushDeferred()
        expect(postHogCaptures()).toContainEqual(
            expect.objectContaining({ distinctId: user.id, event: 'user_logged_in' }),
        )
    })

    it('onUserInvited captures invited for the inviter, with the invite org and role', async () => {
        const { onUserInvited } = await import('./events')
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave', isAdmin: true })
        const invite = await db
            .insertInto('pendingUser')
            .values({ orgId: org.id, email: 'invitee@test.com', isAdmin: true, invitedByUserId: user.id })
            .returning('id')
            .executeTakeFirstOrThrow()

        onUserInvited({ pendingId: invite.id, isResend: true })

        await flushDeferred()
        expect(await getAuditEntriesWithMetadata(invite.id, 'USER')).toContainEqual(
            expect.objectContaining({
                eventType: 'INVITED',
                metadata: { invitedEmail: 'invitee@test.com', isResend: true },
            }),
        )
        expect(postHogCaptures()).toContainEqual({
            distinctId: user.id,
            event: 'invited',
            properties: expect.objectContaining({
                org_id: org.id,
                role: 'admin',
                is_resend: true,
                user_role: 'reviewer',
                is_org_admin: true,
            }),
        })
    })

    it('onUserAcceptInvite records the invite and captures accepted_invite with the membership role', async () => {
        const { onUserAcceptInvite } = await import('./events')
        // An admin accepting a contributor invite stays admin, so the capture reads the membership.
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab', isAdmin: true })
        const invite = await db
            .insertInto('pendingUser')
            .values({ orgId: org.id, email: 'member@test.com', isAdmin: false, claimedByUserId: user.id })
            .returning('id')
            .executeTakeFirstOrThrow()

        onUserAcceptInvite({ userId: user.id, inviteId: invite.id, isNewAccount: false })

        await flushDeferred()
        expect(postHogCaptures()).toContainEqual({
            distinctId: user.id,
            event: 'accepted_invite',
            properties: expect.objectContaining({
                org_id: org.id,
                role: 'admin',
                is_new_account: false,
                user_role: 'researcher',
            }),
        })
        expect(await getAuditEntriesWithMetadata(user.id, 'USER')).toContainEqual(
            expect.objectContaining({ eventType: 'ACCEPTED_INVITE', metadata: { inviteId: invite.id } }),
        )
    })

    it('onUserRoleUpdate audits and captures as the admin who made the change', async () => {
        const { onUserRoleUpdate } = await import('./events')
        const { user: admin, org } = await mockSessionWithTestData({ orgType: 'enclave', isAdmin: true })
        const { user: member } = await insertTestUser({ org })

        onUserRoleUpdate({
            userId: member.id,
            actorId: admin.id,
            orgId: org.id,
            before: { isAdmin: false },
            after: { isAdmin: true },
        })

        await flushDeferred()
        expect(postHogCaptures()).toContainEqual({
            distinctId: admin.id,
            event: 'role_updated',
            properties: expect.objectContaining({
                target_user_id: member.id,
                org_id: org.id,
                role_before: 'contributor',
                role_after: 'admin',
                is_org_admin: true,
            }),
        })
        expect(await getAuditEntries(member.id, 'USER')).toContainEqual({
            eventType: 'UPDATED',
            recordType: 'USER',
            recordId: member.id,
            userId: admin.id,
        })
    })
})
