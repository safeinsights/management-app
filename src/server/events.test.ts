import { describe, expect, it, vi, type Mock } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import { Action } from '@/server/actions/action'
import { deliver } from '@/server/mailgun'
import {
    db,
    flushDeferred,
    getAuditEntries,
    getAuditEntriesWithMetadata,
    insertTestStudyJobData,
    insertTestUser,
    mockSessionWithTestData,
    postHogCaptures,
} from '@/tests/unit.helpers'

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    flush: vi.fn(async () => true),
    // Called by Action when it has a session.
    setUser: vi.fn(),
    setTag: vi.fn(),
}))

// Spread the real module: mailer reads SI_EMAIL from it, and a bare `deliver` mock makes that throw.
vi.mock('@/server/mailgun', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/mailgun')>()),
    deliver: vi.fn(),
}))

const captureExceptionMock = Sentry.captureException as unknown as Mock
const flushMock = Sentry.flush as unknown as Mock
const deliverMock = deliver as unknown as Mock

describe('deferred', () => {
    it('captures and flushes to Sentry when the handler rejects', async () => {
        const { deferred } = await import('@/server/events')
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
        const { deferred } = await import('@/server/events')
        const run = deferred(async () => undefined)

        run()
        await flushDeferred()
        expect(captureExceptionMock).not.toHaveBeenCalled()
        expect(flushMock).not.toHaveBeenCalled()
    })
})

describe('user event captures', () => {
    it('onUserLogIn captures user_logged_in for the user', async () => {
        const { onUserLogIn } = await import('@/server/events')
        const { user } = await mockSessionWithTestData()

        onUserLogIn({ userId: user.id })

        await flushDeferred()
        expect(postHogCaptures()).toContainEqual(
            expect.objectContaining({ distinctId: user.id, event: 'user_logged_in' }),
        )
    })

    it('onUserInvited captures invited for the inviter, with the invite org and role', async () => {
        const { onUserInvited } = await import('@/server/events')
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
        const { onUserAcceptInvite } = await import('@/server/events')
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
        const { onUserRoleUpdate } = await import('@/server/events')
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

const APPROVED_TEMPLATE = 'vb - research proposal approved'

async function setupPendingStudy() {
    const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
    const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })
    return { user, study }
}

const approvalAction = ({ studyId, userId, failAfter }: { studyId: string; userId: string; failAfter: boolean }) =>
    new Action('approval', { performsMutations: true }).handler(async ({ db }) => {
        const { onStudyApproved } = await import('@/server/events')
        await db
            .updateTable('study')
            .set({ status: 'APPROVED', approvedAt: new Date(), reviewerId: userId })
            .where('id', '=', studyId)
            .execute()
        onStudyApproved({ studyId, userId })
        if (failAfter) throw new Error('a later step failed')
        return 'committed'
    })

const approvalSideEffects = async (studyId: string, userEmail: string | null) => ({
    audits: (await getAuditEntries(studyId, 'STUDY')).filter((entry) => entry.eventType === 'APPROVED'),
    captures: postHogCaptures().filter((capture) => capture.event === 'study_proposal_approved'),
    emails: deliverMock.mock.calls.filter(
        ([message]) => message.template === APPROVED_TEMPLATE && message.to === userEmail,
    ),
})

describe('deferred inside an action', () => {
    it('drops the email, audit row and PostHog event of a rolled-back action', async () => {
        const { user, study } = await setupPendingStudy()

        const result = await approvalAction({ studyId: study.id, userId: user.id, failAfter: true })()
        await flushDeferred()

        expect(result).toEqual({ error: 'a later step failed' })
        const row = await db.selectFrom('study').select('status').where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(row.status).toBe('PENDING-REVIEW')
        expect(await approvalSideEffects(study.id, user.email)).toEqual({ audits: [], captures: [], emails: [] })
    })

    it('runs them exactly once after the action commits', async () => {
        const { user, study } = await setupPendingStudy()

        const result = await approvalAction({ studyId: study.id, userId: user.id, failAfter: false })()
        await flushDeferred()

        expect(result).toBe('committed')
        const { audits, captures, emails } = await approvalSideEffects(study.id, user.email)
        expect(audits).toEqual([{ eventType: 'APPROVED', recordType: 'STUDY', recordId: study.id, userId: user.id }])
        expect(captures).toHaveLength(1)
        expect(captures[0]).toMatchObject({ distinctId: user.id })
        expect(emails).toHaveLength(1)
    })

    it('does not start the handler before the action commits', async () => {
        const { deferred } = await import('@/server/events')
        await mockSessionWithTestData()
        const probe = vi.fn(async () => undefined)
        const run = deferred(probe)
        let calledBeforeCommit: boolean | undefined

        const action = new Action('before-commit', { performsMutations: true }).handler(async () => {
            run()
            calledBeforeCommit = probe.mock.calls.length > 0
            return 'committed'
        })

        expect(await action()).toBe('committed')
        await flushDeferred()
        expect(calledBeforeCommit).toBe(false)
        expect(probe).toHaveBeenCalledOnce()
    })

    it('still runs in an action without a transaction when the handler later throws', async () => {
        const { deferred } = await import('@/server/events')
        await mockSessionWithTestData()
        const probe = vi.fn(async () => undefined)
        const run = deferred(probe)

        const action = new Action('no-transaction').handler(async () => {
            run()
            throw new Error('read failed')
        })

        expect(await action()).toEqual({ error: 'read failed' })
        await flushDeferred()
        expect(probe).toHaveBeenCalledOnce()
    })

    it('schedules a call made from an afterCommit hook directly, not back onto the hook list', async () => {
        const { deferred } = await import('@/server/events')
        await mockSessionWithTestData()
        const order: string[] = []
        const probe = vi.fn(async () => {
            order.push('handler')
        })
        const run = deferred(probe)

        const action = new Action('from-hook', { performsMutations: true }).handler(async ({ afterCommit }) => {
            afterCommit(async () => {
                order.push('hook start')
                run()
                order.push('hook end')
            })
            return 'committed'
        })

        expect(await action()).toBe('committed')
        await flushDeferred()
        // A requeued call would run after the hook finished, as a later entry of the same drain.
        expect(order).toEqual(['hook start', 'handler', 'hook end'])
        expect(probe).toHaveBeenCalledOnce()
    })
})
