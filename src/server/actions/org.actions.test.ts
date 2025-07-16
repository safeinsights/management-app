import { describe, expect, it, beforeEach, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { ActionFailure, AccessDeniedError } from '@/lib/errors'
import { db } from '@/database'
import { mockSessionWithTestData, insertTestOrg } from '@/tests/unit.helpers'
import { type Org } from '@/schema/org'
import {
    deleteOrgAction,
    fetchOrgsAction,
    getOrgFromSlugAction,
    insertOrgAction,
    updateOrgSettingsAction,
} from './org.actions'
import logger from '@/lib/logger'
import { auth, currentUser, clerkClient } from '@clerk/nextjs/server'
import { defineAbilityFor } from '@/lib/permissions'
import { getOrgInfoForUserId } from '../db/queries'

// Mock the 'next/cache' module to prevent real cache operations during tests.
vi.mock('next/cache', async (importOriginal) => {
    const originalModule = await importOriginal<typeof import('next/cache')>()
    return {
        ...originalModule,
        revalidatePath: vi.fn(),
    }
})

vi.mock('@/lib/permissions', () => ({
    defineAbilityFor: vi.fn(),
}))

vi.mock('@/server/db/queries', async () => {
    const original = await vi.importActual('@/server/db/queries')
    return {
        ...original,
        getOrgInfoForUserId: vi.fn(),
    }
})

vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(),
    currentUser: vi.fn(),
    clerkClient: vi.fn(() => ({
        users: {
            getUser: vi.fn().mockResolvedValue({
                id: 'user_123',
                publicMetadata: {},
            }),
            updateUserMetadata: vi.fn(),
        },
        organizations: {
            updateOrganization: vi.fn(),
        },
    })),
}))

describe('Org Actions', () => {
    beforeEach(async () => {
        const { session } = await mockSessionWithTestData()
        vi.mocked(auth).mockResolvedValue({
            userId: session.user.id,
            sessionClaims: {
                jti: 'jwt_123',
                ...session.sessionClaims,
            },
        } as any)
        vi.mocked(currentUser).mockResolvedValue({
            id: session.user.id,
        } as any)
        vi.mocked(getOrgInfoForUserId).mockResolvedValue([
            {
                id: 'org_123',
                slug: 'test-org',
                isAdmin: true,
                isResearcher: true,
                isReviewer: true,
            },
        ])

        vi.mocked(defineAbilityFor).mockReturnValue({
            can: () => true,
        } as any)
    })
    const newOrg = {
        slug: 'new-org',
        name: 'A Testing Org',
        email: 'new-org@example.com',
        publicKey: 'no-such-key',
    }

    beforeEach(async () => {
        await insertOrgAction(newOrg)
    })

    describe('inserttOrgAction', () => {
        it('successfully inserts a new org', async () => {
            const org = await db.selectFrom('org').selectAll('org').where('slug', '=', newOrg.slug).executeTakeFirst()
            expect(org).toMatchObject(newOrg)
        })

        it('throws error when duplicate organization name exists for new org', async () => {
            // was inserted in beforeEach, should throw on dupe insert
            await expect(insertOrgAction(newOrg)).rejects.toThrow('duplicate key value violates unique constraint "org_name_key"')
        })

        it('throws error with malformed input', async () => {
            await expect(insertOrgAction({ name: 'bob' } as unknown as Org)).rejects.toThrow(ActionFailure)
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
            await deleteOrgAction({ orgSlug: newOrg.slug })
            const result = await fetchOrgsAction()
            expect(result).not.toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'new-org' })]))
        })
    })

    describe('getOrgFromSlug', () => {
        it('returns org when found', async () => {
            const result = await getOrgFromSlugAction({ orgSlug: newOrg.slug })
            expect(result).toMatchObject(newOrg)
        })

        it('throws when org not found', async () => {
            await expect(getOrgFromSlugAction({ orgSlug: 'non-existent' })).rejects.toThrow('no result')
        })
    })

    describe('updateOrgSettingsAction', () => {
        const targetOrgSlug = 'org-to-be-updated-settings'
        const initialName = 'Initial Org Name for Settings Update'
        const initialDescription = 'Initial Org Description for Settings Update'
        let targetOrg: Org

        beforeEach(async () => {
            targetOrg = await insertTestOrg({ slug: targetOrgSlug, name: initialName, description: initialDescription })
            await mockSessionWithTestData({
                orgSlug: targetOrgSlug,
                isAdmin: true,
            })
            vi.mocked(revalidatePath).mockReset()
        })

        it('successfully updates org name and description in DB and Clerk', async () => {
            const newName = 'Updated Org Name Successfully by Test'
            const newDescription = 'Updated Org Description Successfully by Test'

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

            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}/settings`)
            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}`)
        })

        it('successfully updates org name only in DB and Clerk', async () => {
            const newName = 'Name Only Update'

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

            // revalidate should still run
            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}/settings`)
            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}`)
        })

        it('reverts DB change and throws ActionFailure if Clerk update fails', async () => {
            vi.spyOn(logger, 'error').mockImplementation(() => {})
            vi.spyOn(logger, 'warn').mockImplementation(() => {})
            vi.mocked(clerkClient().organizations.updateOrganization).mockRejectedValue(new Error('Clerk API error'))
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
            await mockSessionWithTestData({ orgSlug: 'any-org', isAdmin: true })

            await expect(
                updateOrgSettingsAction({
                    orgSlug: nonExistentOrgSlug,
                    name: 'Any Name',
                    description: 'Any Description',
                }),
            ).rejects.toThrow(ActionFailure)
        })

        it('throws AccessDeniedError if user is not an admin of the target org', async () => {
            vi.mocked(defineAbilityFor).mockReturnValue({
                can: () => false,
            } as any)

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