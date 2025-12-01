import { describe, expect, it, beforeEach, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { db } from '@/database'
import {
    mockSessionWithTestData,
    insertTestOrg,
    insertTestUser,
    insertTestBaseImage,
    faker,
    actionResult,
} from '@/tests/unit.helpers'
import { type Org } from '@/schema/org'
import {
    deleteOrgAction,
    getOrgFromSlugAction,
    getUsersForOrgAction,
    fetchUsersOrgsWithStatsAction,
    insertOrgAction,
    updateOrgSettingsAction,
    listAllOrgsAction,
    getOrgsWithLanguagesAction,
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
            const result = await fetchUsersOrgsWithStatsAction()
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

    describe('listAllOrgsAction', () => {
        it('returns basic org info (slug, name, type)', async () => {
            const testOrg = await insertTestOrg({
                slug: `basic-org-${faker.string.uuid()}`,
                name: 'Basic Org',
                type: 'enclave',
            })

            const result = actionResult(await listAllOrgsAction())
            const createdOrg = result.find((o) => o.slug === testOrg.slug)

            expect(createdOrg).toBeDefined()
            expect(createdOrg).toMatchObject({
                slug: testOrg.slug,
                name: testOrg.name,
                type: testOrg.type,
            })
        })
    })

    describe('getOrgsWithLanguages', () => {
        it('returns orgs with supportedLanguages from non-testing base images', async () => {
            const testOrg = await insertTestOrg({
                slug: `lang-test-${faker.string.uuid()}`,
                name: 'Language Test Org',
                type: 'enclave',
            })

            // Add a non-testing R base image
            await insertTestBaseImage({
                orgId: testOrg.id,
                name: 'R Production Image',
                language: 'R',
                isTesting: false,
            })

            // Add a testing Python base image (should not appear in supportedLanguages)
            await insertTestBaseImage({
                orgId: testOrg.id,
                name: 'Python Testing Image',
                language: 'PYTHON',
                isTesting: true,
            })

            const result = actionResult(await getOrgsWithLanguagesAction())

            const createdOrg = result.find((o: { slug: string }) => o.slug === testOrg.slug)
            expect(createdOrg).toBeDefined()
            expect(createdOrg!.supportedLanguages).toContain('R')
            expect(createdOrg!.supportedLanguages).not.toContain('PYTHON')
        })

        it('returns orgs with multiple supportedLanguages when both have non-testing images', async () => {
            const testOrg = await insertTestOrg({
                slug: `multi-lang-${faker.string.uuid()}`,
                name: 'Multi Language Org',
                type: 'enclave',
            })

            // Add non-testing images for both languages
            await insertTestBaseImage({
                orgId: testOrg.id,
                name: 'R Production Image',
                language: 'R',
                isTesting: false,
            })

            await insertTestBaseImage({
                orgId: testOrg.id,
                name: 'Python Production Image',
                language: 'PYTHON',
                isTesting: false,
            })

            const result = actionResult(await getOrgsWithLanguagesAction())

            const createdOrg = result.find((o: { slug: string }) => o.slug === testOrg.slug)
            expect(createdOrg).toBeDefined()
            expect(createdOrg!.supportedLanguages).toContain('R')
            expect(createdOrg!.supportedLanguages).toContain('PYTHON')
            expect(createdOrg!.supportedLanguages).toHaveLength(2)
        })

        it('returns empty supportedLanguages for orgs without base images', async () => {
            const testOrg = await insertTestOrg({
                slug: `no-images-${faker.string.uuid()}`,
                name: 'No Images Org',
                type: 'enclave',
            })

            const result = actionResult(await getOrgsWithLanguagesAction())

            const createdOrg = result.find((o: { slug: string }) => o.slug === testOrg.slug)
            expect(createdOrg).toBeDefined()
            expect(createdOrg!.supportedLanguages).toEqual([])
            expect(createdOrg!.hasNoBaseImages).toBe(true)
        })

        it('deduplicates languages when multiple base images share the same language', async () => {
            const testOrg = await insertTestOrg({
                slug: `dedupe-lang-${faker.string.uuid()}`,
                name: 'Dedupe Language Org',
                type: 'enclave',
            })

            await insertTestBaseImage({
                orgId: testOrg.id,
                name: 'R Production Image 1',
                language: 'R',
                isTesting: false,
            })

            await insertTestBaseImage({
                orgId: testOrg.id,
                name: 'R Production Image 2',
                language: 'R',
                isTesting: false,
            })

            const result = actionResult(await getOrgsWithLanguagesAction())

            const createdOrg = result.find((o: { slug: string }) => o.slug === testOrg.slug)
            expect(createdOrg).toBeDefined()
            expect(createdOrg!.supportedLanguages).toContain('R')
            expect(createdOrg!.supportedLanguages).toHaveLength(1)
        })
    })
})
