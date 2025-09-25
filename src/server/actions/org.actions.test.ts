import { describe, expect, it, beforeEach, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { db } from '@/database'
import { mockSessionWithTestData, insertTestOrg, insertTestUser, faker, actionResult } from '@/tests/unit.helpers'
import { type Org } from '@/schema/org'
import {
    deleteOrgAction,
    getOrgFromSlugAction,
    getUsersForOrgAction,
    fetchOrgsWithStatsAction,
    insertOrgAction,
    updateOrgSettingsAction,
} from './org.actions'
import logger from '@/lib/logger'

describe('Org Actions', () => {
    let newOrg: { slug: string; name: string; email: string; type: 'enclave'; settings: { publicKey: string } }
    beforeEach(async () => {
        newOrg = {
            slug: `test-org-${faker.string.uuid()}`,
            name: 'A Testing Org',
            email: 'new-org@example.com',
            type: 'enclave',
            settings: { publicKey: 'no-such-key' },
        }
        await mockSessionWithTestData({ isAdmin: true })
        try {
            await insertOrgAction(newOrg)
        } catch (e) {
            console.error('Error inserting newOrg in beforeEach:', e)
            throw e
        }
    })

    describe('inserttOrgAction', () => {
        it('successfully inserts a new org', async () => {
            const org = await db.selectFrom('org').selectAll('org').where('slug', '=', newOrg.slug).executeTakeFirst()
            expect(org).toMatchObject(newOrg)
        })

        it('throws error when duplicate organization name exists for new org', async () => {
            // was inserted in beforeEach, should throw on dupe insert
            vi.spyOn(console, 'error').mockImplementation(() => undefined)
            const result = await insertOrgAction(newOrg)
            expect(result).toEqual({ error: expect.stringContaining('duplicate key value violates unique constraint') })
        })

        it('throws error with malformed input', async () => {
            const result = await insertOrgAction({ name: 'bob' } as unknown as Parameters<typeof insertOrgAction>[0])
            expect(result).toEqual({ error: expect.stringContaining('Validation error') })
        })
    })

    describe('deleteOrgAction', () => {
        it('deletes org by slug', async () => {
            const org = await db
                .selectFrom('org')
                .selectAll('org')
                .where('slug', '=', newOrg.slug)
                .executeTakeFirstOrThrow()
            await deleteOrgAction({ orgId: org.id })
            const result = await fetchOrgsWithStatsAction()
            expect(result).not.toEqual(expect.arrayContaining([expect.objectContaining({ slug: newOrg.slug })]))
        })
    })

    describe('getOrgFromSlug', () => {
        it('returns org when found', async () => {
            const result = actionResult(await getOrgFromSlugAction({ orgSlug: newOrg.slug }))
            expect(result).toMatchObject(newOrg)
        })

        it('throws when org not found', async () => {
            const result = await getOrgFromSlugAction({ orgSlug: 'non-existent' })
            expect(result).toEqual({ error: expect.stringContaining('no result') })
        })
    })

    describe('updateOrgSettingsAction', () => {
        const targetOrgSlug = faker.string.alpha()
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

        it('successfully updates org name and description in DB', async () => {
            const newName = 'Updated Org Name Successfully by Test'
            const newDescription = 'Updated Org Description Successfully by Test'

            const result = actionResult(
                await updateOrgSettingsAction({
                    orgSlug: targetOrgSlug,
                    name: newName,
                    description: newDescription,
                }),
            )

            const secondOrg = await insertTestOrg({
                slug: faker.string.alpha(),
                name: initialName,
                description: initialDescription,
            })

            expect(result).toEqual({
                success: true,
                message: 'Organization settings updated successfully.',
            })

            const dbOrg = await db
                .selectFrom('org')
                .selectAll('org')
                .where('id', '=', targetOrg.id)
                .executeTakeFirstOrThrow()
            expect(dbOrg.name).toBe(newName)
            expect(dbOrg.description).toBe(newDescription)

            const db2ndOrg = await db
                .selectFrom('org')
                .selectAll('org')
                .where('id', '=', secondOrg.id)
                .executeTakeFirstOrThrow()
            expect(db2ndOrg.name).toBe(initialName)
            expect(db2ndOrg.description).toBe(initialDescription)

            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}/settings`)
            expect(revalidatePath).toHaveBeenCalledWith(`/admin/team/${targetOrgSlug}`)
        })

        it('throws ActionFailure if target org for update is not found in DB', async () => {
            const nonExistentOrgSlug = 'non-existent-org-for-update-action-test'
            await mockSessionWithTestData({ orgSlug: 'any-org', isAdmin: true })

            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            const result = await updateOrgSettingsAction({
                orgSlug: nonExistentOrgSlug,
                name: 'Any Name',
                description: 'Any Description',
            })
            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        })

        it('throws AccessDeniedError if user is not an admin of the target org', async () => {
            await mockSessionWithTestData({ isAdmin: false })
            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            const result = await updateOrgSettingsAction({
                orgSlug: targetOrgSlug,
                name: 'New Name Attempt by Non-Admin',
                description: 'New Description by Non-Admin',
            })
            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        })

        it('throws ActionFailure for invalid input (empty name)', async () => {
            const result = await updateOrgSettingsAction({
                orgSlug: targetOrgSlug,
                name: '',
                description: 'Valid Description',
            })
            expect(result).toEqual({ error: expect.stringContaining('Validation error') })
        })
    })

    describe('getUsersForOrgAction', () => {
        it('allows an org admin to fetch users for their own org', async () => {
            const { org } = await mockSessionWithTestData({ isAdmin: true })
            const usersResult = actionResult(
                await getUsersForOrgAction({
                    orgSlug: org.slug,
                    sort: { columnAccessor: 'fullName', direction: 'asc' },
                }),
            )
            expect(Array.isArray(usersResult)).toBe(true)
            expect(usersResult.length).toBeGreaterThan(0)
            expect(usersResult[0]).toHaveProperty('fullName')
        })

        it('prevents an org admin from fetching users for another org', async () => {
            await mockSessionWithTestData({ isAdmin: true, orgSlug: 'a-regular-org' })
            const otherOrg = await insertTestOrg({ name: 'other-org', slug: 'other-org' })

            vi.spyOn(logger, 'error').mockImplementation(() => undefined)
            const result = await getUsersForOrgAction({
                orgSlug: otherOrg.slug,
                sort: { columnAccessor: 'fullName', direction: 'asc' },
            })
            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        })

        it('allows an SI admin to fetch users for any org', async () => {
            const otherOrg = await insertTestOrg({ name: 'other-org-2', slug: 'other-org-2' })
            await insertTestUser({ org: otherOrg })
            await mockSessionWithTestData({ isSiAdmin: true })

            const usersResult = actionResult(
                await getUsersForOrgAction({
                    orgSlug: otherOrg.slug,
                    sort: { columnAccessor: 'fullName', direction: 'asc' },
                }),
            )
            expect(Array.isArray(usersResult)).toBe(true)
            expect(usersResult.length).toBeGreaterThan(0)
        })

        it('prevents a non-admin from fetching users for their org', async () => {
            const { org } = await mockSessionWithTestData({ isAdmin: false, orgType: 'lab' })
            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            const result = await getUsersForOrgAction({
                orgSlug: org.slug,
                sort: { columnAccessor: 'fullName', direction: 'asc' },
            })
            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        })
    })
})
