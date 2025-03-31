import { db } from '@/database'
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { mockClerkSession, type ClerkMocks } from '@/tests/unit.helpers'
import { adminInviteUserAction } from './admin-users.actions'
import { faker } from '@faker-js/faker'
import { randomString } from 'remeda'
import * as clerk from '@clerk/nextjs/server'
import { sendWelcomeEmail } from '@/server/mailgun'
import { SanitizedError } from '@/lib/errors'

vi.mock('@/server/mailgun', () => ({
    sendWelcomeEmail: vi.fn(),
}))

describe('invite user Actions', async () => {
    let clerkMocks: ClerkMocks | null = null
    beforeEach(() => {
        clerkMocks = mockClerkSession({
            clerkUserId: 'user-id',
            org_slug: CLERK_ADMIN_ORG_SLUG,
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
        const user = await adminInviteUserAction(userInvite)
        expect(user).toMatchObject({
            clerkId: '1234',
            userId: expect.any(String),
        })
        const memberUser = await db
            .selectFrom('memberUser')
            .select('id')
            .where('userId', '=', user.userId)
            .where('memberId', '=', userInvite.organizationId)
            .executeTakeFirst()

        expect(memberUser).toBeTruthy()

        expect(clerkMocks?.client.users.createUser).toHaveBeenCalledWith({
            firstName: userInvite.firstName,
            lastName: userInvite.lastName,
            emailAddress: [userInvite.email],
            password: userInvite.password,
        })

        expect(clerkMocks?.client.organizations.createOrganizationMembership).toHaveBeenCalledWith(
            expect.objectContaining({ userId: '1234' }),
        )

        expect(sendWelcomeEmail).toHaveBeenCalledWith(user.email, `${user.firstName} ${user.lastName}`)
    })

    it('throws an error when user insert fails', async () => {
        clerkMocks?.client.users.createUser.mockImplementation(() =>
            Promise.reject({ errors: [{ code: 'no-user', message: 'failed' }] }),
        )
        await expect(adminInviteUserAction(userInvite)).rejects.toThrowError(expect.any(SanitizedError))
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
