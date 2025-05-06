import { db } from '@/database'
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { mockSessionWithTestData, type ClerkMocks } from '@/tests/unit.helpers'
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
    beforeEach(async () => {
        clerkMocks = await mockSessionWithTestData({ isAdmin: true })
    })

    async function userRecordCount() {
        const c = await db
            .selectFrom('user')
            .select(({ fn }) => [fn.count('user.id').as('ac')])
            .executeTakeFirstOrThrow()
        return Number(c.ac)
    }

    let userInvite = {
        email: '',
        organizationId: '',
        orgSlug: '',
        password: randomString(8),
        isReviewer: true,
        isResearcher: false,
    }

    beforeEach(async () => {
        const orgInfo = await db.selectFrom('org').select(['id', 'slug']).executeTakeFirstOrThrow()
        userInvite = {
            email: faker.internet.email(),
            organizationId: orgInfo.id,
            orgSlug: orgInfo.slug,
            password: randomString(10),
            isReviewer: true,
            isResearcher: false,
        }
    })

    it('creates a new pending user successfully', async () => {
        const userResult = await adminInviteUserAction(userInvite)

        if (!userResult || !('pendingUserId' in userResult) || !('clerkId' in userResult)) {
            throw new Error('adminInviteUserAction did not return expected user details (pendingUserId and clerkId).')
        }

        expect(userResult).toMatchObject({
            clerkId: userResult.clerkId,
            pendingUserId: expect.any(String),
            email: userInvite.email,
        })

        const pendingUser = await db
            .selectFrom('pendingUser')
            .selectAll()
            .where('email', '=', userInvite.email)
            .where('orgSlug', '=', userInvite.orgSlug)
            .executeTakeFirst()

        expect(pendingUser).toBeTruthy()
        expect(pendingUser?.id).toBe(userResult.pendingUserId)
        expect(pendingUser?.organizationId).toBe(userInvite.organizationId)
        expect(pendingUser?.isReviewer).toBe(userInvite.isReviewer)
        expect(pendingUser?.isResearcher).toBe(userInvite.isResearcher)

        expect(clerkMocks?.client.users.createUser).toHaveBeenCalledWith({
            emailAddress: [userInvite.email],
            password: userInvite.password,
            firstName: '',
            lastName: '',
        })

        expect(clerkMocks?.client.organizations.createOrganizationMembership).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: userResult.clerkId,
                organizationId: expect.any(String),
                role: 'org:member',
            }),
        )

        expect(sendWelcomeEmail).toHaveBeenCalledWith(userInvite.email)
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
        expect(beforeCount).toEqual(await userRecordCount())
    })
})
