import { db } from '@/database'
import { sendInviteEmail } from '@/server/mailer'
import { actionResult, insertTestOrg, mockSessionWithTestData } from '@/tests/unit.helpers'
import { clerkClient } from '@clerk/nextjs/server'
import { Mock, describe, expect, it, vi } from 'vitest'
import { getPendingUsersAction, orgAdminInviteUserAction, reInviteUserAction } from './admin-users.actions'

vi.mock('@/server/events', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/events')>()),
    onUserInvited: vi.fn(({ invitedEmail, pendingId }) => {
        sendInviteEmail({ emailTo: invitedEmail, inviteId: pendingId })
    }),
}))
vi.mock('@/server/mailer', () => ({
    sendInviteEmail: vi.fn(),
}))

const mockClerkClient = clerkClient as unknown as Mock

describe('Admin Users Actions', () => {
    it('orgAdminInviteUserAction invites a new user', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        mockClerkClient.mockResolvedValue({
            users: {
                getUserList: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
            },
        })

        const invite = {
            email: 'newuser@test.com',
            permission: 'admin' as const,
        }

        await orgAdminInviteUserAction({ orgSlug: org.slug, invite })

        const pendingUser = await db
            .selectFrom('pendingUser')
            .selectAll('pendingUser')
            .where('email', '=', invite.email)
            .executeTakeFirst()
        expect(pendingUser).toBeDefined()
        expect(pendingUser?.isAdmin).toBe(true)
    })

    it('orgAdminInviteUserAction blocks invite when user is already in org (merged email)', async () => {
        const { org, user } = await mockSessionWithTestData({ isAdmin: true })

        mockClerkClient.mockResolvedValue({
            users: {
                getUserList: vi.fn().mockResolvedValue({
                    data: [{ id: user.clerkId }],
                    totalCount: 1,
                }),
            },
        })

        const invite = {
            email: 'merged-email@test.com',
            permission: 'admin' as const,
        }

        const result = await orgAdminInviteUserAction({
            orgSlug: org.slug,
            invite,
        })

        expect(result).toEqual({
            error: expect.objectContaining({ email: 'This team member is already in this organization.' }),
        })
    })

    it('orgAdminInviteUserAction allows invite when user exists in Clerk but not in this org', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        mockClerkClient.mockResolvedValue({
            users: {
                getUserList: vi.fn().mockResolvedValue({
                    data: [{ id: 'different-clerk-id-not-in-org' }],
                    totalCount: 1,
                }),
            },
        })

        const invite = {
            email: 'existing-user-other-org@test.com',
            permission: 'contributor' as const,
        }

        await orgAdminInviteUserAction({ orgSlug: org.slug, invite })

        const pendingUser = await db
            .selectFrom('pendingUser')
            .selectAll('pendingUser')
            .where('email', '=', invite.email)
            .executeTakeFirst()
        expect(pendingUser).toBeDefined()
        expect(pendingUser?.isAdmin).toBe(false)
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
                isAdmin: false,
            })
            .execute()
        await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: 'pending2@test.com',
                isAdmin: false,
            })
            .execute()

        const pendingUsersResult = actionResult(await getPendingUsersAction({ orgSlug: org.slug }))
        expect(pendingUsersResult).toHaveLength(origCount + 2)
    })

    // Each row's id is the live invite token, so a leak lets an outsider claim a seat in the org
    // (OTTER-724 / MA-6).
    it('getPendingUsersAction denies a non-admin member of the org', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false })
        await db
            .insertInto('pendingUser')
            .values({ orgId: org.id, email: 'member-cannot-see@test.com', isAdmin: false })
            .execute()

        const result = await getPendingUsersAction({ orgSlug: org.slug })
        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        expect(JSON.stringify(result)).not.toContain('member-cannot-see@test.com')
    })

    it('getPendingUsersAction denies an admin of another org', async () => {
        const otherOrg = await insertTestOrg({ slug: 'other-org-pending-invites' })
        await db
            .insertInto('pendingUser')
            .values({ orgId: otherOrg.id, email: 'other-org-invitee@test.com', isAdmin: false })
            .execute()

        await mockSessionWithTestData({ isAdmin: true })

        const result = await getPendingUsersAction({ orgSlug: otherOrg.slug })
        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        expect(JSON.stringify(result)).not.toContain('other-org-invitee@test.com')
    })

    it('reInviteUserAction re-invites a user', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const pendingUser = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: 'reinvite@test.com',
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
