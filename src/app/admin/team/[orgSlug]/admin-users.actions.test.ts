import { db } from '@/database'
import { sendInviteEmail } from '@/server/mailer'
import { mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { getPendingUsersAction, orgAdminInviteUserAction, reInviteUserAction } from './admin-users.actions'

vi.mock('@/server/events', () => ({
    onUserInvited: vi.fn(({ invitedEmail, pendingId }) => {
        sendInviteEmail({ emailTo: invitedEmail, inviteId: pendingId })
    }),
}))
vi.mock('@/server/mailer', () => ({
    sendInviteEmail: vi.fn(),
}))

describe('Admin Users Actions', () => {
    it('orgAdminInviteUserAction invites a user', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const invite = {
            email: 'newuser@test.com',
            role: 'researcher' as const,
            permission: 'admin' as const,
        }

        await orgAdminInviteUserAction({ orgSlug: org.slug, invite })

        const pendingUser = await db
            .selectFrom('pendingUser')
            .selectAll('pendingUser')
            .where('email', '=', invite.email)
            .executeTakeFirst()
        expect(pendingUser).toBeDefined()
        expect(pendingUser?.isResearcher).toBe(true)
        expect(pendingUser?.isReviewer).toBe(false)
        expect(pendingUser?.isAdmin).toBe(true)
    })

    it('getPendingUsersAction returns pending users', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const result = actionResult(await getPendingUsersAction({ orgSlug: org.slug }))
        const origCount = Array.isArray(result) ? result.length : 0

        await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: 'pending1@test.com',
                isResearcher: true,
                isReviewer: false,
                isAdmin: false,
            })
            .execute()
        await db
            .insertInto('pendingUser')
            .values({ orgId: org.id, email: 'pending2@test.com', isResearcher: false, isReviewer: true, isAdmin: true })
            .execute()

        const pendingUsersResult = actionResult(await getPendingUsersAction({ orgSlug: org.slug }))
        expect(pendingUsersResult).toHaveLength(origCount + 2)
    })

    it('reInviteUserAction re-invites a user', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const pendingUser = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: 'reinvite@test.com',
                isResearcher: true,
                isReviewer: false,
                isAdmin: false,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await reInviteUserAction({ orgSlug: org.slug, pendingUserId: pendingUser.id })

        expect(sendInviteEmail).toHaveBeenCalledWith({
            emailTo: 'reinvite@test.com',
            inviteId: pendingUser.id,
        })
    })
})
