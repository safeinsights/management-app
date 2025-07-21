import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest'
import { auth as clerkAuth, clerkClient } from '@clerk/nextjs/server'
import { faker, insertTestOrg, insertTestUser } from '@/tests/unit.helpers'
import { onCreateAccountAction } from './create-account.action'
import { db } from '@/database'
import { v7 } from 'uuid'

describe('Create Account Actions', () => {
    let org = { id: '', slug: '' }

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
                updateUserMetadata: vi.fn(async () => ({})),
                getUser: vi.fn(() => null),
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
                email: 'newuser@test.com',
                isResearcher: true,
                isReviewer: true,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await onCreateAccountAction({ inviteId: invite.id, form })

        const newUser = await db.selectFrom('user').where('email', '=', 'newuser@test.com').executeTakeFirst()
        expect(newUser).toBeDefined()
    })

    it('onCreateAccountAction throws an error if invite not found', async () => {
        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'password',
            confirmPassword: 'password',
        }

        await expect(onCreateAccountAction({ inviteId: v7(), form })).rejects.toThrow('not found')
    })

    it('onCreateAccountAction handles existing user', async () => {
        const { user } = await insertTestUser({ org })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: user.email!,
                isResearcher: true,
                isReviewer: true,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'password',
            confirmPassword: 'password',
        }

        const { userId } = await onCreateAccountAction({ inviteId: invite.id, form })
        expect(userId).toEqual(user.id)
        const orgUsers = await db.selectFrom('orgUser').select('orgId').where('userId', '=', userId).execute()
        expect(orgUsers).toHaveLength(1)
    })

    it('onCreateAccountAction adds to existing user', async () => {
        const { user } = await insertTestUser({ org })

        const newOrg = await insertTestOrg()

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: newOrg.id,
                email: user.email!,
                isResearcher: true,
                isReviewer: true,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'password',
            confirmPassword: 'password',
        }

        const { userId } = await onCreateAccountAction({ inviteId: invite.id, form })
        expect(userId).toEqual(user.id)
        const orgUsers = await db.selectFrom('orgUser').select('orgId').where('userId', '=', userId).execute()
        expect(orgUsers).toHaveLength(2)
        expect(orgUsers).toEqual(
            expect.arrayContaining([
                // list the same pattern twice → forces two separate matches
                expect.objectContaining({ orgId: org.id }),
                expect.objectContaining({ orgId: newOrg.id }),
            ]),
        )
    })
})
