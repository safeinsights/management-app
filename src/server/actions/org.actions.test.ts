import { describe, expect, it, beforeEach, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { db } from '@/database'
import {
    enableClerkOrgSync,
    mockSessionWithTestData,
    insertTestOrg,
    insertTestUser,
    insertTestCodeEnv,
    faker,
    actionResult,
    installFakeClerkOrgs,
} from '@/tests/unit.helpers'
import { type Org } from '@/schema/org'
import {
    deleteOrgAction,
    fetchAdminOrgsWithStatsAction,
    getOrgFromSlugAction,
    updateOrgAction,
    getUsersForOrgAction,
    fetchUsersOrgsAction,
    insertOrgAction,
    updateOrgSettingsAction,
    getStudyCapableEnclaveOrgsAction,
    getLanguagesForOrgAction,
} from './org.actions'
import logger from '@/lib/logger'
import { isActionError } from '@/lib/errors'

beforeEach(enableClerkOrgSync)

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn().mockResolvedValue('https://mock-signed-url.example.com/file'),
    }
})

describe('Org Actions', () => {
    let fake: ReturnType<typeof installFakeClerkOrgs>
    let newOrg: { slug: string; name: string; email: string; type: 'enclave'; settings: { publicKey: string } }

    beforeEach(async () => {
        newOrg = {
            slug: `test-org-${faker.string.uuid()}`,
            name: 'A Testing Org',
            email: 'new-org@example.com',
            type: 'enclave',
            settings: { publicKey: 'no-such-key' },
        }
        await mockSessionWithTestData({ isSiAdmin: true })
        fake = installFakeClerkOrgs()
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
            const result = await fetchUsersOrgsAction()
            expect(result).not.toEqual(expect.arrayContaining([expect.objectContaining({ slug: newOrg.slug })]))
        })
    })

    describe('Clerk sync', () => {
        it('creates a Clerk org with no leftover creator member on insert', async () => {
            const clerkOrg = [...fake.orgs.values()].find((o) => o.slug === newOrg.slug)
            expect(clerkOrg).toMatchObject({ name: newOrg.name, publicMetadata: { type: 'enclave' } })
            expect(fake.members.get(clerkOrg!.id)?.size).toBe(0)
        })

        it('renames the Clerk org on update and ignores a changed slug', async () => {
            const org = await db
                .selectFrom('org')
                .selectAll('org')
                .where('slug', '=', newOrg.slug)
                .executeTakeFirstOrThrow()
            actionResult(
                await updateOrgAction({
                    ...newOrg,
                    id: org.id,
                    slug: 'attempted-new-slug',
                    name: 'Renamed Org',
                } as Parameters<typeof updateOrgAction>[0]),
            )
            const after = await db.selectFrom('org').select('slug').where('id', '=', org.id).executeTakeFirstOrThrow()
            expect(after.slug).toBe(newOrg.slug)
            expect([...fake.orgs.values()].find((o) => o.slug === newOrg.slug)?.name).toBe('Renamed Org')
        })

        it('renames the Clerk org from the settings action', async () => {
            actionResult(await updateOrgSettingsAction({ orgSlug: newOrg.slug, name: 'Settings Name' }))
            expect([...fake.orgs.values()].find((o) => o.slug === newOrg.slug)?.name).toBe('Settings Name')
        })

        it('deletes the Clerk org on delete', async () => {
            const org = await db
                .selectFrom('org')
                .select('id')
                .where('slug', '=', newOrg.slug)
                .executeTakeFirstOrThrow()
            actionResult(await deleteOrgAction({ orgId: org.id }))
            expect(fake.orgs.size).toBe(0)
        })

        it('still creates the org when Clerk fails, and logs', async () => {
            const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
            fake.api.createOrganization.mockRejectedValueOnce(new Error('clerk down'))
            const slug = `fails-${faker.string.uuid()}`
            actionResult(await insertOrgAction({ ...newOrg, slug }))
            expect(await db.selectFrom('org').select('id').where('slug', '=', slug).executeTakeFirst()).toBeDefined()
            expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'clerk down' }))
        })
    })

    describe('getOrgFromSlug', () => {
        it('returns org when found', async () => {
            const result = actionResult(await getOrgFromSlugAction({ orgSlug: newOrg.slug }))
            expect(result).toMatchObject({ slug: newOrg.slug, name: newOrg.name, type: newOrg.type })
        })

        it('omits settings and email from the org it returns', async () => {
            const result = actionResult(await getOrgFromSlugAction({ orgSlug: newOrg.slug }))
            expect(result).not.toHaveProperty('settings')
            expect(result).not.toHaveProperty('email')
            expect(JSON.stringify(result)).not.toContain(newOrg.settings.publicKey)
            expect(JSON.stringify(result)).not.toContain(newOrg.email)
        })

        it('leaks neither publicKey nor email when the org is not found', async () => {
            vi.spyOn(logger, 'error').mockImplementation(() => undefined)
            const result = await getOrgFromSlugAction({ orgSlug: 'non-existent' })
            expect(isActionError(result)).toBe(true)
            expect(JSON.stringify(result)).not.toContain(newOrg.settings.publicKey)
            expect(JSON.stringify(result)).not.toContain(newOrg.email)
        })

        // `view Org` is unconditioned by design, so this errors in the handler, not at the ability check.
        it('leaks nothing for a non-SI-admin when the org is not found', async () => {
            await mockSessionWithTestData({ isAdmin: true })
            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            const result = await getOrgFromSlugAction({ orgSlug: 'non-existent' })
            expect(isActionError(result)).toBe(true)
            expect(JSON.stringify(result)).not.toContain(newOrg.settings.publicKey)
            expect(JSON.stringify(result)).not.toContain(newOrg.email)
        })
    })

    describe('fetchAdminOrgsWithStatsAction', () => {
        it('denies an org admin who is not an SI admin', async () => {
            await mockSessionWithTestData({ isAdmin: true })
            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            const result = await fetchAdminOrgsWithStatsAction()
            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
            expect(JSON.stringify(result)).not.toContain(newOrg.settings.publicKey)
        })

        it('allows an SI admin', async () => {
            await mockSessionWithTestData({ isSiAdmin: true })
            const result = actionResult(await fetchAdminOrgsWithStatsAction())
            expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ slug: newOrg.slug })]))
        })
    })

    describe('updateOrgAction', () => {
        // settings.publicKey is the RS256 key verifying that enclave's M2M API tokens (MA-5).
        it('denies an org admin changing type, slug, or settings.publicKey', async () => {
            const target = await db
                .selectFrom('org')
                .selectAll('org')
                .where('slug', '=', newOrg.slug)
                .executeTakeFirstOrThrow()

            await mockSessionWithTestData({ orgSlug: newOrg.slug, isAdmin: true })
            vi.spyOn(logger, 'error').mockImplementation(() => undefined)

            const result = await updateOrgAction({
                id: target.id,
                slug: 'attacker-controlled-slug',
                name: target.name,
                email: 'attacker@example.com',
                type: 'enclave',
                settings: { publicKey: 'attacker-supplied-public-key' },
            } as Parameters<typeof updateOrgAction>[0])

            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })

            const unchanged = await db
                .selectFrom('org')
                .selectAll('org')
                .where('id', '=', target.id)
                .executeTakeFirstOrThrow()
            expect(unchanged.slug).toBe(newOrg.slug)
            expect(unchanged.type).toBe('enclave')
            expect(unchanged.settings).toEqual(target.settings)
        })
    })

    describe('updateOrgSettingsAction', () => {
        const targetOrgSlug = faker.string.alpha(10)
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

            const secondOrg = await insertTestOrg({
                slug: faker.string.alpha(10),
                name: initialName,
                description: initialDescription,
            })

            const result = actionResult(
                await updateOrgSettingsAction({
                    orgSlug: targetOrgSlug,
                    name: newName,
                    description: newDescription,
                }),
            )

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

            expect(revalidatePath).toHaveBeenCalledWith(`/${targetOrgSlug}/admin/settings`)
            expect(revalidatePath).toHaveBeenCalledWith(`/${targetOrgSlug}/admin/team`)
            expect(revalidatePath).toHaveBeenCalledTimes(2)
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

    describe('getStudyCapableEnclaveOrgsAction', () => {
        it('returns orgs with supportedLanguages from non-testing code environments', async () => {
            const testOrg = await insertTestOrg({
                slug: `lang-test-${faker.string.uuid()}`,
                name: 'Language Test Org',
                type: 'enclave',
            })

            await insertTestCodeEnv({
                orgId: testOrg.id,
                name: 'R Production Image',
                language: 'R',
                isTesting: false,
            })

            await insertTestCodeEnv({
                orgId: testOrg.id,
                name: 'Python Testing Image',
                language: 'PYTHON',
                isTesting: true,
            })

            const result = actionResult(await getStudyCapableEnclaveOrgsAction())

            const createdOrg = result.find((o: { slug: string }) => o.slug === testOrg.slug)
            expect(createdOrg).toBeDefined()

            const langs = actionResult(await getLanguagesForOrgAction({ orgSlug: testOrg.slug }))
            expect(langs.languages).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        label: 'R',
                        value: 'R',
                        starterCodeUrls: expect.any(Array),
                        commandLines: expect.any(Object),
                    }),
                ]),
            )
        })

        // A stale session can leave orgSlug empty; it must fail validation, not 500 the page.
        it('rejects an empty orgSlug with a validation error', async () => {
            const result = await getLanguagesForOrgAction({ orgSlug: '' })
            expect(result).toEqual({ error: expect.stringContaining('Validation error') })
        })

        // OTTER-724 narrowed the neighbouring config reads; pin that this catalog pair stayed open.
        it('stays readable cross-org for a lab researcher', async () => {
            const enclaveOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
            await insertTestCodeEnv({ orgId: enclaveOrg.id, language: 'R', isTesting: false })

            await mockSessionWithTestData({ orgType: 'lab', isAdmin: false })

            const orgs = actionResult(await getStudyCapableEnclaveOrgsAction())
            expect(orgs).toEqual(expect.arrayContaining([expect.objectContaining({ slug: enclaveOrg.slug })]))

            const langs = actionResult(await getLanguagesForOrgAction({ orgSlug: enclaveOrg.slug }))
            expect(langs.languages).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'R' })]))
        })
    })
})
