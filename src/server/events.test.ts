import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { after } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import {
    db,
    getAuditEntries,
    getAuditEntriesWithMetadata,
    insertTestUser,
    mockSessionWithTestData,
    expectPostHogCapture,
} from '@/tests/unit.helpers'

// Run after() inline so the failure-reporting path is observable synchronously.
vi.mock('next/server', () => ({
    after: vi.fn((cb: () => unknown) => cb()),
}))

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    flush: vi.fn(async () => true),
}))

// Spread the real module: mailer reads SI_EMAIL from it, and a bare `deliver` mock makes that throw.
vi.mock('@/server/mailgun', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/mailgun')>()),
    deliver: vi.fn(),
}))

const afterMock = after as unknown as Mock
const captureExceptionMock = Sentry.captureException as unknown as Mock
const flushMock = Sentry.flush as unknown as Mock

describe('deferred', () => {
    beforeEach(() => {
        afterMock.mockImplementation((cb: () => unknown) => cb())
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('captures and flushes to Sentry when the handler rejects', async () => {
        const { deferred } = await import('./events')
        const boom = new Error('handler exploded')
        const run = deferred(async () => {
            throw boom
        })

        run()
        await vi.waitFor(() => expect(captureExceptionMock).toHaveBeenCalledWith(boom))
        // Without the flush the event is dropped when the instance freezes after the response.
        expect(flushMock).toHaveBeenCalled()
    })

    it('does not report when the handler resolves', async () => {
        const { deferred } = await import('./events')
        const run = deferred(async () => undefined)

        run()
        await vi.waitFor(() => expect(afterMock).toHaveBeenCalled())
        expect(captureExceptionMock).not.toHaveBeenCalled()
        expect(flushMock).not.toHaveBeenCalled()
    })
})

// after() runs inline here rather than through the shared queue, so captures are polled for.
describe('user event captures', () => {
    it('onUserLogIn captures user_logged_in for the user', async () => {
        const { onUserLogIn } = await import('./events')
        const { user } = await mockSessionWithTestData()

        onUserLogIn({ userId: user.id })

        await expectPostHogCapture(expect.objectContaining({ distinctId: user.id, event: 'user_logged_in' }))
    })

    it('onUserInvited captures invited for the inviter, with the invite org and role', async () => {
        const { onUserInvited } = await import('./events')
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave', isAdmin: true })
        const pending = await db
            .insertInto('pendingUser')
            .values({ orgId: org.id, email: 'invitee@test.com', isAdmin: true, invitedByUserId: user.id })
            .returning('id')
            .executeTakeFirstOrThrow()

        onUserInvited({ invitedEmail: 'invitee@test.com', pendingId: pending.id, isResend: true })

        await expectPostHogCapture({
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

    it('onUserAcceptInvite records the invite and org, and captures accepted_invite', async () => {
        const { onUserAcceptInvite } = await import('./events')
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })
        const inviteId = crypto.randomUUID()

        onUserAcceptInvite({ userId: user.id, inviteId, orgId: org.id, isAdmin: false, isNewAccount: true })

        await expectPostHogCapture({
            distinctId: user.id,
            event: 'accepted_invite',
            properties: expect.objectContaining({
                org_id: org.id,
                role: 'member',
                is_new_account: true,
                user_role: 'researcher',
            }),
        })
        expect(await getAuditEntriesWithMetadata(user.id, 'USER')).toContainEqual(
            expect.objectContaining({ eventType: 'ACCEPTED_INVITE', metadata: { inviteId, orgId: org.id } }),
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

        await expectPostHogCapture({
            distinctId: admin.id,
            event: 'role_updated',
            properties: expect.objectContaining({
                target_user_id: member.id,
                org_id: org.id,
                role_before: 'member',
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
