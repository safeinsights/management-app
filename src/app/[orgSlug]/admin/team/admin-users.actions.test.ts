import { db } from '@/database'
import { sendInviteEmail } from '@/server/mailer'
import { actionResult, faker, mockSessionWithTestData } from '@/tests/unit.helpers'
import { clerkClient } from '@clerk/nextjs/server'
import { Mock, describe, expect, it, vi } from 'vitest'
import { getPendingUsersAction, orgAdminInviteUserAction, reInviteUserAction } from './admin-users.actions'

vi.mock('@/server/events', () => ({
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

        // Mock Clerk to return no existing user for this email (new user)
        mockClerkClient.mockResolvedValue({
            users: {
                getUserList: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
            },
        })

        const invite = {
            email: 'newuser@test.com',
            permission: 'admin' as const,
        }

        await orgAdminInviteUserAction({ orgSlug: org.slug, invite, invitedByUserId: faker.string.uuid() })

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

        // Mock Clerk to return the session user when searching by email (simulating a merged email)
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
            invitedByUserId: user.id,
        })

        expect(result).toEqual({
            error: expect.objectContaining({ email: 'This team member is already in this organization.' }),
        })
    })

    it('orgAdminInviteUserAction allows invite when user exists in Clerk but not in this org', async () => {
        const { org, user } = await mockSessionWithTestData({ isAdmin: true })

        // Mock Clerk to return a different user (not in this org)
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

        await orgAdminInviteUserAction({ orgSlug: org.slug, invite, invitedByUserId: user.id })

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
