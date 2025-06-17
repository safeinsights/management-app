import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { mockSessionWithTestData, insertTestOrg, insertPendingUser } from '@/tests/unit.helpers'
import { onCreateAccountAction, claimInviteAction } from './invite.actions'
import { faker } from '@faker-js/faker'
import { clerkClient } from '@clerk/nextjs/server'
import { ActionFailure } from '@/lib/errors'
import { db } from '@/database'
import { onUserAcceptInvite } from '@/server/events'

vi.mock('@/server/events', () => ({
    onUserAcceptInvite: vi.fn(),
}))

const clerkClientMock = clerkClient as Mock

describe('Invite Actions', () => {
    describe('onCreateAccountAction', () => {
        let org: Awaited<ReturnType<typeof insertTestOrg>>
        let pendingUser: Awaited<ReturnType<typeof insertPendingUser>>
        const email = faker.internet.email()
        const form = {
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            password: faker.internet.password({ length: 10 }),
        }

        beforeEach(async () => {
            org = await insertTestOrg()
            pendingUser = await insertPendingUser({ org, email })
            clerkClientMock.mockClear()
        })

        it('creates a new user when invite is valid and user does not exist', async () => {
            clerkClientMock.mockResolvedValue({
                users: {
                    getUserList: vi.fn().mockResolvedValue({ data: [] }),
                    createUser: vi.fn().mockResolvedValue({ id: 'new_clerk_user_123' }),
                    updateUserMetadata: vi.fn().mockResolvedValue({}),
                },
                organizations: {
                    getOrganization: vi.fn().mockResolvedValue({ id: 'clerk_org_id' }),
                    createOrganizationMembership: vi.fn().mockResolvedValue({}),
                },
            })

            const result = await onCreateAccountAction({ inviteId: pendingUser.id, email, form })

            expect(result).toBe('new_clerk_user_123')
            const client = await clerkClient()
            expect(client.users.createUser).toHaveBeenCalledWith({
                emailAddress: [email],
                password: form.password,
                firstName: form.firstName,
                lastName: form.lastName,
            })
        })

        it('throws ActionFailure if invite is invalid', async () => {
            await expect(onCreateAccountAction({ inviteId: faker.string.uuid(), email, form })).rejects.toThrow(
                ActionFailure,
            )
        })

        it('throws ActionFailure if email does not match invite', async () => {
            await expect(
                onCreateAccountAction({ inviteId: pendingUser.id, email: 'wrong@email.com', form }),
            ).rejects.toThrow(ActionFailure)
        })

        it('throws ActionFailure if user already exists in Clerk', async () => {
            clerkClientMock.mockResolvedValue({
                users: {
                    getUserList: vi.fn().mockResolvedValue({ data: [{ id: 'existing_user' }] }),
                },
            })

            await expect(onCreateAccountAction({ inviteId: pendingUser.id, email, form })).rejects.toThrow(
                ActionFailure,
            )
        })

        it('throws ActionFailure if invite is already claimed', async () => {
            await db
                .updateTable('pendingUser')
                .set({ claimedByUserId: faker.string.uuid() })
                .where('id', '=', pendingUser.id)
                .execute()

            await expect(onCreateAccountAction({ inviteId: pendingUser.id, email, form })).rejects.toThrow(
                ActionFailure,
            )
        })
    })

    describe('claimInviteAction', () => {
        beforeEach(() => {
            vi.clearAllMocks()
        })

        it('claims an invite for an existing user and adds them to a new organization', async () => {
            const { user, client } = await mockSessionWithTestData()
            const orgB = await insertTestOrg({ name: 'Org B', slug: 'org-b' })
            const pendingUser = await insertPendingUser({
                org: orgB,
                email: user.email!,
                isResearcher: true,
                isReviewer: true,
            })

            client.organizations.getOrganization.mockResolvedValue({
                id: 'clerk_org_b_id',
                slug: orgB.slug,
                name: orgB.name,
            })
            client.organizations.createOrganizationMembership.mockResolvedValue({ id: 'mem_456' })
            Object.assign(client.users, { updateUserMetadata: vi.fn().mockResolvedValue({}) })

            const result = await claimInviteAction({ inviteId: pendingUser.id })

            expect(result.success).toBe(true)
            expect(result.organizationName).toBe(orgB.name)
            expect(result.orgSlug).toBe(orgB.slug)

            const orgBMembership = await db
                .selectFrom('orgUser')
                .where('userId', '=', user.id)
                .where('orgId', '=', orgB.id)
                .select(['isResearcher', 'isReviewer'])
                .executeTakeFirst()
            expect(orgBMembership?.isResearcher).toBe(true)
            expect(orgBMembership?.isReviewer).toBe(true)

            const claimedInvite = await db
                .selectFrom('pendingUser')
                .where('id', '=', pendingUser.id)
                .select('claimedByUserId')
                .executeTakeFirst()
            expect(claimedInvite?.claimedByUserId).toBe(user.id)

            expect(onUserAcceptInvite).toHaveBeenCalledWith(user.id)
        })

        it('returns an error for an invalid invite ID', async () => {
            await mockSessionWithTestData()
            const result = await claimInviteAction({ inviteId: faker.string.uuid() })
            expect(result.success).toBe(false)
            expect(result.error).toContain('Invalid or already claimed invitation.')
        })

        it('returns an error if invite is already claimed', async () => {
            const { user, org } = await mockSessionWithTestData()
            const pendingUser = await insertPendingUser({ org, email: user.email! })
            await db
                .updateTable('pendingUser')
                .set({ claimedByUserId: faker.string.uuid() })
                .where('id', '=', pendingUser.id)
                .execute()

            const result = await claimInviteAction({ inviteId: pendingUser.id })
            expect(result.success).toBe(false)
            expect(result.error).toContain('Invalid or already claimed invitation.')
        })

        it('handles existing organization membership in Clerk gracefully and still claims invite', async () => {
            const { user, org, client } = await mockSessionWithTestData()
            const pendingUser = await insertPendingUser({ org, email: user.email! })

            client.organizations.getOrganization.mockResolvedValue({
                id: 'clerk_org_id',
                slug: org.slug,
                name: org.name,
            })
            client.organizations.createOrganizationMembership.mockRejectedValue({
                errors: [{ code: 'duplicate_organization_membership' }],
            })
            client.users.getUser.mockResolvedValue({ publicMetadata: {} })
            Object.assign(client.users, { updateUserMetadata: vi.fn().mockResolvedValue({}) })

            const result = await claimInviteAction({ inviteId: pendingUser.id })
            expect(result.success).toBe(true)

            const claimedInvite = await db
                .selectFrom('pendingUser')
                .where('id', '=', pendingUser.id)
                .select('claimedByUserId')
                .executeTakeFirst()
            expect(claimedInvite?.claimedByUserId).toBe(user.id)
        })

        it('returns an error if the invite is for a different user', async () => {
            // Logged in as `user`.
            const { org } = await mockSessionWithTestData()
            const otherUserEmail = faker.internet.email()
            // Invite is for `otherUserEmail`
            const pendingUser = await insertPendingUser({ org, email: otherUserEmail })

            // Action is called by the logged in user.
            const result = await claimInviteAction({ inviteId: pendingUser.id })

            expect(result.success).toBe(false)
            expect(result.error).toContain('This invitation is for a different user. Please log out and try again.')

            // Verify invite was not claimed
            const claimedInvite = await db
                .selectFrom('pendingUser')
                .where('id', '=', pendingUser.id)
                .select('claimedByUserId')
                .executeTakeFirst()
            expect(claimedInvite?.claimedByUserId).toBeNull()
        })
    })
})
