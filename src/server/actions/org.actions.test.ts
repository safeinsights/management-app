import { describe, expect, it, beforeEach, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { ActionFailure, AccessDeniedError } from '@/lib/errors'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { db } from '@/database'
import { mockClerkSession, mockSessionWithTestData, insertTestOrg } from '@/tests/unit.helpers'
import { type Org } from '@/schema/org'
import {
    deleteOrgAction,
    fetchOrgsAction,
    getOrgFromSlugAction,
    upsertOrgAction,
    updateOrgSettingsAction,
} from './org.actions'
import logger from '@/lib/logger'

// Mock the 'next/cache' module to prevent real cache operations during tests.
vi.mock('next/cache', async (importOriginal) => {
    const originalModule = await importOriginal<typeof import('next/cache')>()
    return {
        ...originalModule,
        // Mock the revalidatePath function. This allows tests to verify that
        // `revalidatePath` is called with the expected arguments after a successful action,
        // without actually attempting to interact with the Next.js caching system.
        revalidatePath: vi.fn(),
    }
})

describe('Org Actions', () => {
    beforeEach(() => {
        mockClerkSession({
            clerkUserId: 'user-id',
            org_slug: CLERK_ADMIN_ORG_SLUG,
        })
    })
    const newOrg = {
        slug: 'new-org',
        name: 'A Testing Org',
        email: 'new-org@example.com',
        publicKey: 'no-such-key',
    }

    beforeEach(async () => {
        await upsertOrgAction(newOrg)
    })

    describe('upsertOrgAction', () => {
        it('successfully inserts a new org', async () => {
            const org = await db.selectFrom('org').selectAll('org').where('slug', '=', newOrg.slug).executeTakeFirst()
            expect(org).toMatchObject(newOrg)
        })

        it('throws error when duplicate organization name exists for new org', async () => {
            // was inserted in beforeEach, should throw on dupe insert
            await expect(upsertOrgAction(newOrg)).rejects.toThrow('Organization with this name already exists')
        })

        it('throws error with malformed input', async () => {
            await expect(upsertOrgAction({ name: 'bob' } as unknown as Org)).rejects.toThrow()
        })
    })

    describe('fetchOrgsAction', () => {
        it('returns orgs', async () => {
            const result = await fetchOrgsAction()
            expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'new-org' })]))
        })
    })

    describe('deleteOrgAction', () => {
        it('deletes org by slug', async () => {
            await deleteOrgAction(newOrg.slug)
            const result = await fetchOrgsAction()
            expect(result).not.toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'new-org' })]))
        })
    })

    describe('getOrgFromSlug', () => {
        it('returns org when found', async () => {
            const result = await getOrgFromSlugAction(newOrg.slug)
            expect(result).toMatchObject(newOrg)
        })

        it('throws when org not found', async () => {
            await expect(getOrgFromSlugAction('non-existent')).rejects.toThrow('Org not found')
        })
    })

    describe('updateOrgSettingsAction', () => {
        const targetOrgSlug = 'org-to-be-updated-settings'
        const initialName = 'Initial Org Name for Settings Update'
        const initialDescription = 'Initial Org Description for Settings Update'
        let targetOrg: Org
        let orgAdminClerkId = 'clerk-user-org-admin-settings'

        let clientMocksForTestScope: ReturnType<typeof mockClerkSession>['client']

        beforeEach(async () => {
            targetOrg = await insertTestOrg({ slug: targetOrgSlug, name: initialName, description: initialDescription })
            const { user: adminUser, client } = await mockSessionWithTestData({
                orgSlug: targetOrgSlug,
                isAdmin: true,
                clerkId: orgAdminClerkId,
            })
            orgAdminClerkId = adminUser.clerkId
            clientMocksForTestScope = client // Store for use in tests
            clientMocksForTestScope.organizations.updateOrganization.mockReset()
            vi.mocked(revalidatePath).mockReset()
        })

        it('successfully updates org name and description in DB and Clerk', async () => {
            const newName = 'Updated Org Name Successfully by Test'
            const newDescription = 'Updated Org Description Successfully by Test'
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            clientMocksForTestScope.organizations.updateOrganization.mockResolvedValue({} as any) // Use 'as any' for simplicity

            const result = await updateOrgSettingsAction({
                orgSlug: targetOrgSlug,
                name: newName,
                description: newDescription,
            })

            expect(result.success).toBe(true)
            expect(result.message).toBe('Organization settings updated successfully.')

            const dbOrg = await db.selectFrom('org').selectAll('org').where('id', '=', targetOrg.id).executeTakeFirst()
            expect(dbOrg?.name).toBe(newName)
            expect(dbOrg?.description).toBe(newDescription)

            expect(clientMocksForTestScope.organizations.updateOrganization).toHaveBeenCalledWith(targetOrg.id, {
                name: newName,
            })
            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}/settings`)
            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}`)
        })

        it('successfully updates org name only in DB and Clerk', async () => {
            const newName = 'Name Only Update'
            // stub clerk update
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            clientMocksForTestScope.organizations.updateOrganization.mockResolvedValue({} as any)

            const result = await updateOrgSettingsAction({
                orgSlug: targetOrgSlug,
                name: newName,
                description: initialDescription, // unchanged
            })

            expect(result.success).toBe(true)
            // verify DB
            const dbOrg = await db.selectFrom('org').selectAll('org').where('id', '=', targetOrg.id).executeTakeFirst()
            expect(dbOrg?.name).toBe(newName)
            expect(dbOrg?.description).toBe(initialDescription)

            // clerk should be called with new name only
            expect(clientMocksForTestScope.organizations.updateOrganization).toHaveBeenCalledWith(targetOrg.id, {
                name: newName,
            })
            // revalidate should still run
            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}/settings`)
            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}`)
        })

        it('successfully updates description only in DB without calling Clerk', async () => {
            const newDescription = 'Description Only Update'

            const result = await updateOrgSettingsAction({
                orgSlug: targetOrgSlug,
                name: initialName, // unchanged
                description: newDescription,
            })

            expect(result.success).toBe(true)
            // verify DB
            const dbOrg = await db.selectFrom('org').selectAll('org').where('id', '=', targetOrg.id).executeTakeFirst()
            expect(dbOrg?.name).toBe(initialName)
            expect(dbOrg?.description).toBe(newDescription)

            // clerk should NOT be called when name is unchanged
            expect(clientMocksForTestScope.organizations.updateOrganization).not.toHaveBeenCalled()
            // revalidate should still run
            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}/settings`)
            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}`)
        })

        it('reverts DB change and throws ActionFailure if Clerk update fails', async () => {
            clientMocksForTestScope.organizations.updateOrganization.mockRejectedValue(
                new Error('Clerk API error 500 from test mock'),
            )
            vi.spyOn(logger, 'error').mockImplementation(() => {})
            vi.spyOn(logger, 'warn').mockImplementation(() => {})
            await expect(
                updateOrgSettingsAction({
                    orgSlug: targetOrgSlug,
                    name: 'Update Attempt (Clerk Fail Test)',
                    description: initialDescription,
                }),
            ).rejects.toThrow(ActionFailure)

            const dbOrg = await db.selectFrom('org').selectAll('org').where('id', '=', targetOrg.id).executeTakeFirst()
            expect(dbOrg?.name).toBe(initialName)
            expect(dbOrg?.description).toBe(initialDescription)
        })

        it('throws ActionFailure if target org for update is not found in DB', async () => {
            const nonExistentOrgSlug = 'non-existent-org-for-update-action-test'
            await mockSessionWithTestData({ orgSlug: CLERK_ADMIN_ORG_SLUG, isAdmin: true })

            await expect(
                updateOrgSettingsAction({
                    orgSlug: nonExistentOrgSlug,
                    name: 'Any Name',
                    description: 'Any Description',
                }),
            ).rejects.toThrow(ActionFailure)
        })

        it('throws AccessDeniedError if user is not an admin of the target org', async () => {
            await mockSessionWithTestData({
                orgSlug: targetOrgSlug,
                isAdmin: false,
                clerkId: 'clerk-non-admin-id-settings',
            })

            await expect(
                updateOrgSettingsAction({
                    orgSlug: targetOrgSlug,
                    name: 'New Name Attempt by Non-Admin',
                    description: 'New Description by Non-Admin',
                }),
            ).rejects.toThrow(AccessDeniedError)
        })

        it('throws ActionFailure for invalid input (empty name)', async () => {
            await expect(
                updateOrgSettingsAction({
                    orgSlug: targetOrgSlug,
                    name: '',
                    description: 'Valid Description',
                }),
            ).rejects.toThrow(ActionFailure)
        })
    })
})
