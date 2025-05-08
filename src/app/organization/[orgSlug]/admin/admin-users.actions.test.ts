import { db } from '@/database'
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { ClerkMocks, mockSessionWithTestData } from '@/tests/unit.helpers'
import { adminInviteUserAction } from './admin-users.actions'
import { faker } from '@faker-js/faker'
import * as clerk from '@clerk/nextjs/server'
import { sendWelcomeEmail } from '@/server/mailgun'
import { SanitizedError } from '@/lib/errors'
import { getPendingUsersAction, reInviteUserAction } from './admin-users.actions'

vi.mock('@/server/mailgun', () => ({
    sendWelcomeEmail: vi.fn(),
}))

describe('invite user Actions', async () => {
    let clerkMocks: Awaited<ReturnType<typeof mockSessionWithTestData>> | null = null
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
        orgId: '',
        isReviewer: true,
        isResearcher: false,
    }

    beforeEach(async () => {
        userInvite = {
            email: faker.internet.email(),
            orgId: clerkMocks?.org.id || '',
            isReviewer: true,
            isResearcher: false,
        }
    })

    it('creates a new pending user successfully', async () => {
        const userResult = await adminInviteUserAction(userInvite)

        expect(userResult).toMatchObject({
            clerkId: '1234',
            pendingUserId: expect.any(String),
            email: userInvite.email,
        })

        const pendingUser = await db
            .selectFrom('pendingUser')
            .selectAll()
            .where('email', '=', userInvite.email)
            .executeTakeFirst()

        expect(pendingUser).toBeTruthy()

        expect(clerkMocks?.client.users.createUser).toHaveBeenCalledWith({
            emailAddress: [userInvite.email],
            password: userInvite.password,
            firstName: '',
            lastName: '',
        })

        expect(clerkMocks?.client.organizations.createOrganizationMembership).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'clerkId' in userResult ? userResult.clerkId : undefined,
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

    it('getPendingUsersAction returns pending users for org', async () => {
        const emails = [faker.internet.email(), faker.internet.email()]
        await db
            .insertInto('pendingUser')
            .values([
                { orgId: userInvite.orgId, email: emails[0], isResearcher: false, isReviewer: false },
                { orgId: userInvite.orgId, email: emails[1], isResearcher: false, isReviewer: false },
            ])
            .execute()
        const pendingUsersInOrg = await getPendingUsersAction({ orgSlug: '123' })
        expect(pendingUsersInOrg.map((u) => u.email)).toEqual(expect.arrayContaining(emails))
    })



    it('reInviteUserAction sends email', async () => {
        const invite = await db
            .insertInto('pendingUser')

            .values({
                orgId: userInvite.orgId,
                email: faker.internet.email(),
                isResearcher: false,
                isReviewer: false,
            })
            .returning('id')
            .executeTakeFirstOrThrow()
        const res = await reInviteUserAction({ pendingUserId: invite.id, orgSlug: clerkMocks?.org.slug || ''})

        expect(sendWelcomeEmail).toHaveBeenCalledWith(userInvite.email)
        expect(res).toEqual({ success: true })
    })


})
