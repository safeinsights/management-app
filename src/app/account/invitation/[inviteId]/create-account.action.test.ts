import { db } from '@/database'
import { faker, insertTestOrg, insertTestUser, mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import { auth as clerkAuth, clerkClient } from '@clerk/nextjs/server'
import { v7 } from 'uuid'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
    getOrgInfoForInviteAction,
    onCreateAccountAction,
    onJoinTeamAccountAction,
    onPendingUserLoginAction,
    onRevokeInviteAction,
} from './create-account.action'

vi.mock('@/server/events')

describe('Create Account Actions', () => {
    let org = { id: '', slug: '', name: '' }

    beforeEach(async () => {
        org = await insertTestOrg()
        const client = clerkClient as unknown as Mock
        const auth = clerkAuth as unknown as Mock
        auth.mockResolvedValue({
            userId: null,
            sessionClaims: null,
        })

        client.mockResolvedValue({
            users: {
                createUser: vi.fn(),
                updateUserMetadata: vi.fn(async () => ({})),
                getUser: vi.fn(() => ({ publicMetadata: {} })),
                getUserList: vi.fn(async () => ({
                    totalCount: 1,
                    data: [
                        {
                            id: faker.string.alpha(10),
                        },
                    ],
                })),
            },
        })
    })

    it('onCreateAccountAction creates a new user', async () => {
        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'password',
            confirmPassword: 'password',
        }

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: faker.internet.email({ provider: 'test.com' }),
                isResearcher: true,
                isReviewer: true,
                isAdmin: false,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await onCreateAccountAction({ inviteId: invite.id, form })

        const newUser = await db.selectFrom('user').where('email', '=', invite.email).executeTakeFirst()
        expect(newUser).toBeDefined()
    })

    it('onCreateAccountAction throws an error if invite not found', async () => {
        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'password',
            confirmPassword: 'password',
        }

        const result = await onCreateAccountAction({ inviteId: v7(), form })
        expect(result).toEqual({ error: expect.objectContaining({ invite: 'not found' }) })
    })

    it('onCreateAccountAction rejects existing user', async () => {
        const { user } = await insertTestUser({ org })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: user.email!,
                isResearcher: true,
                isReviewer: true,
                isAdmin: false,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'password',
            confirmPassword: 'password',
        }
        const result = await onCreateAccountAction({ inviteId: invite.id, form })
        expect(result).toEqual({ error: expect.objectContaining({ user: 'already has account' }) })
    })

    it('onJoinTeamAccountAction adds to existing user', async () => {
        const { user } = await insertTestUser({ org })

        const newOrg = await insertTestOrg()

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: newOrg.id,
                email: user.email!,
                isResearcher: true,
                isReviewer: true,
                isAdmin: false,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(await onJoinTeamAccountAction({ inviteId: invite.id }))
        const userId = result.id
        expect(userId).toEqual(user.id)
        const orgUsers = await db.selectFrom('orgUser').select('orgId').where('userId', '=', userId).execute()
        expect(orgUsers).toHaveLength(2)
        expect(orgUsers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ orgId: org.id }),
                expect.objectContaining({ orgId: newOrg.id }),
            ]),
        )
    })

    it('onRevokeInviteAction removes invite', async () => {
        const { user } = await insertTestUser({ org })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: user.email!,
                isResearcher: true,
                isReviewer: true,
                isAdmin: false,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await onRevokeInviteAction({ inviteId: invite.id })

        const found = await db.selectFrom('pendingUser').select(['id']).where('id', '=', invite.id).executeTakeFirst()
        expect(found).toBeFalsy()
    })

    it('onPendingUserLoginAction claims invite for logged in user', async () => {
        const { user } = await mockSessionWithTestData({ orgSlug: org.slug })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: faker.internet.email({ provider: 'test.com' }),
                isResearcher: true,
                isReviewer: true,
                isAdmin: false,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await onPendingUserLoginAction({ inviteId: invite.id })

        const updatedInvite = await db
            .selectFrom('pendingUser')
            .select(['claimedByUserId'])
            .where('id', '=', invite.id)
            .executeTakeFirst()

        expect(updatedInvite?.claimedByUserId).toBe(user.id)
    })

    it('getOrgInfoForInviteAction returns org information for valid invite', async () => {
        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: faker.internet.email({ provider: 'test.com' }),
                isResearcher: true,
                isReviewer: true,
                isAdmin: false,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(await getOrgInfoForInviteAction({ inviteId: invite.id }))

        expect(result).toMatchObject({
            id: org.id,
            name: org.name,
            slug: org.slug,
            email: invite.email,
        })
    })

    it('getOrgInfoForInviteAction throws error for invalid invite', async () => {
        const result = await getOrgInfoForInviteAction({ inviteId: v7() })
        expect(result).toEqual({ error: expect.stringContaining('no result') })
    })
})
