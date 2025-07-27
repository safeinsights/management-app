import { describe, expect, it, beforeEach, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { ActionFailure } from '@/lib/errors'
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

describe('Org Actions', () => {
    const newOrg = {
        slug: 'new-org',
        name: 'A Testing Org',
        email: 'new-org@example.com',
        publicKey: 'no-such-key',
    }

    beforeEach(async () => {
        await mockSessionWithTestData({ isAdmin: true })

        // vi.mocked(auth).mockResolvedValue({
        await insertOrgAction(newOrg)
    })

    describe('inserttOrgAction', () => {
        it('successfully inserts a new org', async () => {
            const org = await db.selectFrom('org').selectAll('org').where('slug', '=', newOrg.slug).executeTakeFirst()
            expect(org).toMatchObject(newOrg)
        })

        it('throws error when duplicate organization name exists for new org', async () => {
            // was inserted in beforeEach, should throw on dupe insert
            vi.spyOn(console, 'error').mockImplementation(() => undefined)
            await expect(insertOrgAction(newOrg)).rejects.toThrow(/duplicate key value violates unique constraint/)
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
            const org = await db.selectFrom('org').selectAll('org').where('slug', '=', newOrg.slug).executeTakeFirstOrThrow()
        await deleteOrgAction({ orgId: org.id })
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

        it('successfully updates org name and description in DB', async () => {
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

        it('throws ActionFailure if target org for update is not found in DB', async () => {
            const nonExistentOrgSlug = 'non-existent-org-for-update-action-test'
            await mockSessionWithTestData({ orgSlug: 'any-org', isAdmin: true })

            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            await expect(
                updateOrgSettingsAction({
                    orgSlug: nonExistentOrgSlug,
                    name: 'Any Name',
                    description: 'Any Description',
                }),
            ).rejects.toThrow(ActionFailure)
        })

        it('throws AccessDeniedError if user is not an admin of the target org', async () => {
            await mockSessionWithTestData({ isAdmin: false })
            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            await expect(
                updateOrgSettingsAction({
                    orgSlug: targetOrgSlug,
                    name: 'New Name Attempt by Non-Admin',
                    description: 'New Description by Non-Admin',
                }),
            ).rejects.toThrow(ActionFailure)
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
