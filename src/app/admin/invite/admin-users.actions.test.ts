import { db } from '@/database'
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { mockClerkSession } from '@/tests/unit.helpers'
import { adminInviteUserAction } from './admin-users.actions'
import { faker } from '@faker-js/faker'
import { randomString } from 'remeda'
import * as clerk from '@clerk/nextjs/server'

describe('invite user Actions', async () => {
    beforeEach(() => {
        mockClerkSession({
            clerkUserId: 'user-id',
            org_slug: 'safe-insights',
        })
    })
    async function userRecordCount() {
        const c = await db
            .selectFrom('user')
            .select(({ fn }) => [fn.count('user.id').as('ac')])
            .executeTakeFirstOrThrow()
        return Number(c.ac)
    }

    let userInvite = {
        firstName: '',
        lastName: '',
        email: '',
        organizationId: '',
        password: randomString(8),
        isReviewer: true,
        isResearcher: false,
    }

    beforeEach(async () => {
        userInvite = {
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            email: faker.internet.email(),
            organizationId: (await db.selectFrom('member').select('id').executeTakeFirstOrThrow()).id,
            password: randomString(10),
            isReviewer: true,
            isResearcher: false,
        }
    })

    it('creates a new user and member_user record successfully', async () => {
        ;(clerk.clerkClient as Mock).mockImplementation(() => ({
            users: {
                createUser: vi.fn(() => ({ id: '1234' })),
            },
        }))

        const user = await adminInviteUserAction(userInvite)
        expect(user).toMatchObject({
            clerkId: '1234',
            userId: expect.any(String),
        })
        const memberUser = db
            .selectFrom('memberUser')
            .select('id')
            .where('userId', '=', user.userId)
            .where('memberId', '=', userInvite.organizationId)
            .executeTakeFirst()
        expect(memberUser).toBeTruthy()
    })

    it('throws an error when user insert fails', async () => {
        await expect(adminInviteUserAction(userInvite)).rejects.toThrowError()
    })

    it('throws an error when clerk createUser fails', async () => {
        const beforeCount = await userRecordCount()

        ;(clerk.clerkClient as Mock).mockImplementation(() => ({
            users: {
                createUser: vi.fn(() => Promise.reject(new Error())),
            },
        }))
        await expect(adminInviteUserAction(userInvite)).rejects.toThrowError()
        expect(beforeCount).toEqual((await userRecordCount()) - 1)
    })
})
