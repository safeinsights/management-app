import { describe, expect, it, vi } from 'vitest'
import {
    mockSessionWithTestData,
    actionResult,
    getAuditEntriesWithMetadata,
    insertTestCodeEnv,
    insertTestDataSource,
    insertTestOrg,
} from '@/tests/unit.helpers'
import {
    createOrgCodeEnvAction,
    deleteOrgCodeEnvAction,
    fetchCodeEnvHistoryAction,
    fetchOrgCodeEnvsAction,
    fetchStarterCodeAction,
    updateOrgCodeEnvAction,
} from './code-envs.actions'
import { db } from '@/database'
import { isActionError } from '@/lib/errors'
import { REDACTED_ENV_VALUE, codeEnvAuditMetadataSchema } from '@/lib/audit-diff'
import { insertFakeCodeScan } from '@/server/actions/simulate-scan'
import { OrgCodeEnvSettings } from '@/database/types'

vi.mock('@/server/actions/simulate-scan', async () => {
    const actual = await vi.importActual('@/server/actions/simulate-scan')
    return { ...actual, insertFakeCodeScan: vi.fn(actual.insertFakeCodeScan as never) }
})

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        deleteS3File: vi.fn().mockResolvedValue(undefined),
        deleteFolderContents: vi.fn().mockResolvedValue(undefined),
        createAthenaDatabase: vi.fn().mockResolvedValue(undefined),
        deleteAthenaDatabase: vi.fn().mockResolvedValue(undefined),
        deleteAllAthenaTables: vi.fn().mockResolvedValue(undefined),
        deleteTestDataBucketPrefix: vi.fn().mockResolvedValue(undefined),
        copyToTestDataBucket: vi.fn().mockResolvedValue([]),
        inferColumnsFromCsv: vi.fn().mockResolvedValue([]),
        createAthenaTable: vi.fn().mockResolvedValue(undefined),
        testDataBucketName: vi.fn().mockReturnValue(null),
        createPgDatabase: vi.fn().mockResolvedValue(undefined),
        deletePgDatabase: vi.fn().mockResolvedValue(undefined),
    }
})

describe('Code Environment Actions', () => {
    it('createOrgCodeEnvAction creates a code environment', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = actionResult(
            await createOrgCodeEnvAction({
                orgSlug: org.slug,
                name: 'Test Image',
                identifier: 'test_image',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                starterCodeFileNames: ['test.py'],
                isTesting: true,
                settings: { environment: [] },
                dataSourceIds: [],
            }),
        )

        expect(result).toBeDefined()
        expect(result.url).toEqual('test-url')
        expect(result.name).toEqual('Test Image')
        expect(result.starterCodeFileNames).toBeDefined()
    })

    it('deleteOrgCodeEnvAction deletes a code environment', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Test Image to Delete',
                identifier: 'test_delete',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: true,
                starterCodeFileNames: ['starter.py'],
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await deleteOrgCodeEnvAction({ orgSlug: org.slug, codeEnvId: codeEnv.id })

        const deletedImage = await db.selectFrom('orgCodeEnv').where('id', '=', codeEnv.id).executeTakeFirst()
        expect(deletedImage).toBeUndefined()
    })

    it('fetchOrgCodeEnvsAction fetches code environments', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Test Image to Fetch',
                identifier: 'test_fetch',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: true,
                starterCodeFileNames: ['starter.py'],
            })
            .execute()

        const result = actionResult(await fetchOrgCodeEnvsAction({ orgSlug: org.slug }))
        expect(result).toHaveLength(1)
        expect(result[0].name).toEqual('Test Image to Fetch')
    })

    it('updateOrgCodeEnvAction updates a code environment without changing starter code', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Test Image to Update',
                identifier: 'test_update',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodeFileNames: ['starter.py'],
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(
            await updateOrgCodeEnvAction({
                orgSlug: org.slug,
                codeEnvId: codeEnv.id,
                name: 'Updated Test Image',
                identifier: 'test_update',
                commandLines: { py: 'updated command' },
                language: 'PYTHON',
                url: 'updated-url',
                isTesting: true,
                settings: { environment: [] },
                dataSourceIds: [],
            }),
        )

        expect(result).toBeDefined()
        expect(result.name).toEqual('Updated Test Image')
        expect(result.commandLines).toEqual({ py: 'updated command' })
        expect(result.language).toEqual('PYTHON')
        expect(result.url).toEqual('updated-url')
        expect(result.isTesting).toEqual(true)
        expect(result.starterCodeFileNames).toEqual(['starter.py'])
    })

    it('updateOrgCodeEnvAction updates a code environment with new starter code file', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Test Image to Update',
                identifier: 'test_update_starter',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodeFileNames: ['old-starter.py'],
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(
            await updateOrgCodeEnvAction({
                orgSlug: org.slug,
                codeEnvId: codeEnv.id,
                name: 'Updated Test Image',
                identifier: 'test_update_starter',
                commandLines: { py: 'updated command' },
                language: 'PYTHON',
                url: 'updated-url',
                isTesting: true,
                starterCodeFileNames: ['new-starter.py'],
                starterCodeUploaded: true,
                settings: { environment: [] },
                dataSourceIds: [],
            }),
        )

        expect(result).toBeDefined()
        expect(result.name).toEqual('Updated Test Image')
        expect(result.starterCodeFileNames).toBeDefined()
        expect(result.starterCodeFileNames).toContain('new-starter.py')
    })

    it('updateOrgCodeEnvAction denies update for non-admin org member', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false })

        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Non-admin cannot update',
                identifier: 'non_admin',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodeFileNames: ['starter.R'],
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = await updateOrgCodeEnvAction({
            orgSlug: org.slug,
            codeEnvId: codeEnv.id,
            name: 'Attempted Update',
            identifier: 'non_admin',
            commandLines: { py: 'updated command' },
            language: 'PYTHON',
            url: 'updated-url',
            isTesting: true,
            settings: { environment: [] },
            dataSourceIds: [],
        })

        expect(isActionError(result)).toBe(true)
    })

    // A denied ability check stringifies the whole CASL subject into the error it returns, so a
    // row loaded in middleware puts its plaintext env var values in that message.
    it('updateOrgCodeEnvAction does not leak env var values to a denied non-admin', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false })

        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Holds a secret',
                identifier: 'secret_holder',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodeFileNames: ['starter.R'],
                settings: { environment: [{ name: 'DB_PASSWORD', value: 'super-secret-value' }] },
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = await updateOrgCodeEnvAction({
            orgSlug: org.slug,
            codeEnvId: codeEnv.id,
            name: 'Attempted Update',
            identifier: 'secret_holder',
            commandLines: { r: 'test command' },
            language: 'R',
            url: 'test-url',
            isTesting: false,
            settings: { environment: [] },
            dataSourceIds: [],
        })

        expect(isActionError(result)).toBe(true)
        expect(JSON.stringify(result)).not.toContain('super-secret-value')
    })

    it('updateOrgCodeEnvAction does not leak another org env var values', async () => {
        const otherOrg = await insertTestOrg({ slug: 'other-org-env-leak' })

        const otherEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: otherOrg.id,
                name: 'Other org secret',
                identifier: 'other_secret',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodeFileNames: ['starter.R'],
                settings: { environment: [{ name: 'DB_PASSWORD', value: 'other-org-secret-value' }] },
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        // Middleware looks the row up by client-supplied orgSlug and codeEnvId, so only the
        // ability check stands between an org admin and another org's row.
        await mockSessionWithTestData({ isAdmin: true })

        const result = await updateOrgCodeEnvAction({
            orgSlug: otherOrg.slug,
            codeEnvId: otherEnv.id,
            name: 'Attempted Update',
            identifier: 'other_secret',
            commandLines: { r: 'test command' },
            language: 'R',
            url: 'test-url',
            isTesting: false,
            settings: { environment: [] },
            dataSourceIds: [],
        })

        expect(isActionError(result)).toBe(true)
        expect(JSON.stringify(result)).not.toContain('other-org-secret-value')
    })

    it('deleteOrgCodeEnvAction does not leak another org env var values', async () => {
        const otherOrg = await insertTestOrg({ slug: 'other-org-delete-leak' })

        const otherEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: otherOrg.id,
                name: 'Other org secret to delete',
                identifier: 'other_delete_secret',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: true,
                starterCodeFileNames: ['starter.R'],
                settings: { environment: [{ name: 'API_KEY', value: 'other-org-delete-secret' }] },
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await mockSessionWithTestData({ isAdmin: true })

        const result = await deleteOrgCodeEnvAction({ orgSlug: otherOrg.slug, codeEnvId: otherEnv.id })

        expect(isActionError(result)).toBe(true)
        expect(JSON.stringify(result)).not.toContain('other-org-delete-secret')
    })

    it('updateOrgCodeEnvAction allows SI admin to update even if not org admin', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false, isSiAdmin: true })

        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'SI admin can update',
                identifier: 'si_admin',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodeFileNames: ['starter.R'],
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(
            await updateOrgCodeEnvAction({
                orgSlug: org.slug,
                codeEnvId: codeEnv.id,
                name: 'Updated by SI admin',
                identifier: 'si_admin',
                commandLines: { py: 'updated command' },
                language: 'PYTHON',
                url: 'updated-url',
                isTesting: true,
                settings: { environment: [] },
                dataSourceIds: [],
            }),
        )

        expect(result).toBeDefined()
        expect(result.name).toEqual('Updated by SI admin')
        expect(result.commandLines).toEqual({ py: 'updated command' })
        expect(result.language).toEqual('PYTHON')
        expect(result.url).toEqual('updated-url')
        expect(result.isTesting).toEqual(true)
    })

    it('deleteOrgCodeEnvAction prevents deletion of last non-testing code environment per language', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const rImage = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Only R Image',
            language: 'R',
            isTesting: false,
        })

        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Python Image',
            language: 'PYTHON',
            isTesting: false,
        })

        const result = await deleteOrgCodeEnvAction({ orgSlug: org.slug, codeEnvId: rImage.id })

        expect(isActionError(result)).toBe(true)
        if (isActionError(result)) {
            expect(result.error).toContain('Cannot delete the last non-testing R code environment')
        }

        const stillExists = await db.selectFrom('orgCodeEnv').where('id', '=', rImage.id).executeTakeFirst()
        expect(stillExists).toBeDefined()
    })

    it('deleteOrgCodeEnvAction allows deletion when multiple non-testing code environments exist for language', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const rImage1 = await insertTestCodeEnv({
            orgId: org.id,
            name: 'R Image 1',
            language: 'R',
            isTesting: false,
        })

        await insertTestCodeEnv({
            orgId: org.id,
            name: 'R Image 2',
            language: 'R',
            isTesting: false,
        })

        await deleteOrgCodeEnvAction({ orgSlug: org.slug, codeEnvId: rImage1.id })

        const deleted = await db.selectFrom('orgCodeEnv').where('id', '=', rImage1.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('deleteOrgCodeEnvAction allows deletion of testing code environments regardless of count', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        await insertTestCodeEnv({
            orgId: org.id,
            name: 'Production R Image',
            language: 'R',
            isTesting: false,
        })

        const testingImage = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Testing R Image',
            language: 'R',
            isTesting: true,
        })

        await deleteOrgCodeEnvAction({ orgSlug: org.slug, codeEnvId: testingImage.id })

        const deleted = await db.selectFrom('orgCodeEnv').where('id', '=', testingImage.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('deleteOrgCodeEnvAction prevents deleting the only scan-passed code environment for a language', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const passed = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Passed R Image',
            language: 'R',
            isTesting: false,
        })

        const failed = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Failed R Image',
            language: 'R',
            isTesting: false,
        })

        await db.insertInto('codeScan').values({ codeEnvId: passed.id, status: 'SCAN-COMPLETE' }).execute()
        await db.insertInto('codeScan').values({ codeEnvId: failed.id, status: 'SCAN-FAILED' }).execute()

        const result = await deleteOrgCodeEnvAction({ orgSlug: org.slug, codeEnvId: passed.id })

        expect(isActionError(result)).toBe(true)
        if (isActionError(result)) {
            expect(result.error).toContain('passed scanning')
        }

        const stillExists = await db.selectFrom('orgCodeEnv').where('id', '=', passed.id).executeTakeFirst()
        expect(stillExists).toBeDefined()
    })

    it('deleteOrgCodeEnvAction allows deleting a scan-failed code environment when a passed one remains', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const passed = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Passed R Image',
            language: 'R',
            isTesting: false,
        })

        const failed = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Failed R Image',
            language: 'R',
            isTesting: false,
        })

        await db.insertInto('codeScan').values({ codeEnvId: passed.id, status: 'SCAN-COMPLETE' }).execute()
        await db.insertInto('codeScan').values({ codeEnvId: failed.id, status: 'SCAN-FAILED' }).execute()

        await deleteOrgCodeEnvAction({ orgSlug: org.slug, codeEnvId: failed.id })

        const deleted = await db.selectFrom('orgCodeEnv').where('id', '=', failed.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('deleteOrgCodeEnvAction allows deleting a scan-passed code environment when another passed one exists', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const passed1 = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Passed R Image 1',
            language: 'R',
            isTesting: false,
        })

        const passed2 = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Passed R Image 2',
            language: 'R',
            isTesting: false,
        })

        await db.insertInto('codeScan').values({ codeEnvId: passed1.id, status: 'SCAN-COMPLETE' }).execute()
        await db.insertInto('codeScan').values({ codeEnvId: passed2.id, status: 'SCAN-COMPLETE' }).execute()

        await deleteOrgCodeEnvAction({ orgSlug: org.slug, codeEnvId: passed1.id })

        const deleted = await db.selectFrom('orgCodeEnv').where('id', '=', passed1.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('createOrgCodeEnvAction with athena does not call createAthenaDatabase in test env', async () => {
        const { createAthenaDatabase } = await import('@/server/aws')
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        actionResult(
            await createOrgCodeEnvAction({
                orgSlug: org.slug,
                name: 'Athena Env',
                identifier: 'athena_env',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                starterCodeFileNames: ['test.py'],
                isTesting: true,
                settings: { environment: [] },
                dataSourceType: 'athena',
                dataSourceIds: [],
            }),
        )

        expect(createAthenaDatabase).not.toHaveBeenCalled()
    })

    it('createOrgCodeEnvAction creates a code environment with environment variables', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const environment = [
            { name: 'MY_VAR', value: 'my_value' },
            { name: 'APIKEY', value: 'secret123' },
        ]

        const result = actionResult(
            await createOrgCodeEnvAction({
                orgSlug: org.slug,
                name: 'Test Image with Env',
                identifier: 'test_env_vars',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                starterCodeFileNames: ['test.py'],
                isTesting: true,
                settings: { environment },
                dataSourceIds: [],
            }),
        )

        expect(result).toBeDefined()
        expect((result.settings as OrgCodeEnvSettings).environment).toEqual(environment)
    })

    it('createOrgCodeEnvAction defaults settings.environment to empty array', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = actionResult(
            await createOrgCodeEnvAction({
                orgSlug: org.slug,
                name: 'Test Image without Env',
                identifier: 'test_no_env',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                starterCodeFileNames: ['test.py'],
                isTesting: true,
                settings: { environment: [] },
                dataSourceIds: [],
            }),
        )

        expect(result).toBeDefined()
        expect((result.settings as OrgCodeEnvSettings).environment).toEqual([])
    })

    it('updateOrgCodeEnvAction updates environment variables', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Test Image',
                identifier: 'test_env_update',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodeFileNames: ['starter.py'],
                settings: { environment: [{ name: 'OLDVAR', value: 'old_value' }] },
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const newEnvironment = [
            { name: 'NEW_VAR', value: 'new_value' },
            { name: 'ANOTHER', value: 'another_value' },
        ]

        const result = actionResult(
            await updateOrgCodeEnvAction({
                orgSlug: org.slug,
                codeEnvId: codeEnv.id,
                name: 'Test Image',
                identifier: 'test_env_update',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: false,
                settings: { environment: newEnvironment },
                dataSourceIds: [],
            }),
        )
        expect(result).toBeDefined()
        expect((result.settings as OrgCodeEnvSettings).environment).toEqual(newEnvironment)
    })

    it('updateOrgCodeEnvAction allows org admin to update a code environment', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const codeEnv = await insertTestCodeEnv({
            orgId: org.id,
            name: 'Original Name',
            language: 'R',
            isTesting: false,
        })

        const result = actionResult(
            await updateOrgCodeEnvAction({
                orgSlug: org.slug,
                codeEnvId: codeEnv.id,
                name: 'Admin Updated Name',
                identifier: codeEnv.identifier,
                commandLines: { py: 'admin updated command' },
                language: 'PYTHON',
                url: 'admin-updated-url',
                isTesting: true,
                settings: { environment: [{ name: 'ADMIN_VAR', value: 'admin_value' }] },
                dataSourceIds: [],
            }),
        )

        expect(result).toBeDefined()
        expect(result.name).toEqual('Admin Updated Name')
        expect(result.commandLines).toEqual({ py: 'admin updated command' })
        expect(result.language).toEqual('PYTHON')
        expect(result.url).toEqual('admin-updated-url')
        expect(result.isTesting).toEqual(true)
        expect((result.settings as OrgCodeEnvSettings).environment).toEqual([
            { name: 'ADMIN_VAR', value: 'admin_value' },
        ])
    })

    it('fetchOrgCodeEnvsAction returns environment variables', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const environment = [{ name: 'TESTVAR', value: 'test_value' }]

        await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Test Image with Env',
                identifier: 'fetch_env_vars',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                isTesting: true,
                starterCodeFileNames: ['starter.py'],
                settings: { environment },
            })
            .execute()

        const result = actionResult(await fetchOrgCodeEnvsAction({ orgSlug: org.slug }))
        expect(result).toHaveLength(1)
        expect((result[0].settings as OrgCodeEnvSettings).environment).toEqual(environment)
    })

    it('creates a code environment with linked data sources', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const ds1 = await insertTestDataSource({ orgId: org.id, name: 'DS One' })
        const ds2 = await insertTestDataSource({ orgId: org.id, name: 'DS Two' })

        const result = actionResult(
            await createOrgCodeEnvAction({
                orgSlug: org.slug,
                name: 'Env with DS',
                identifier: 'env_with_ds',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                starterCodeFileNames: ['test.py'],
                isTesting: true,
                settings: { environment: [] },
                dataSourceIds: [ds1.id, ds2.id],
            }),
        )

        const joinRows = await db
            .selectFrom('orgDataSourceCodeEnv')
            .selectAll('orgDataSourceCodeEnv')
            .where('codeEnvId', '=', result.id)
            .execute()
        expect(joinRows).toHaveLength(2)
        expect(joinRows.map((r) => r.dataSourceId).sort()).toEqual([ds1.id, ds2.id].sort())
    })

    it('creates a code environment with no data sources', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = actionResult(
            await createOrgCodeEnvAction({
                orgSlug: org.slug,
                name: 'Env no DS',
                identifier: 'env_no_ds',
                commandLines: { r: 'test command' },
                language: 'R',
                url: 'test-url',
                starterCodeFileNames: ['test.py'],
                isTesting: true,
                settings: { environment: [] },
                dataSourceIds: [],
            }),
        )

        const joinRows = await db
            .selectFrom('orgDataSourceCodeEnv')
            .selectAll('orgDataSourceCodeEnv')
            .where('codeEnvId', '=', result.id)
            .execute()
        expect(joinRows).toHaveLength(0)
    })

    it('updates code environment and replaces data source associations', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const ds1 = await insertTestDataSource({ orgId: org.id, name: 'DS One' })
        const ds2 = await insertTestDataSource({ orgId: org.id, name: 'DS Two' })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, language: 'R', isTesting: false })

        await db.insertInto('orgDataSourceCodeEnv').values({ dataSourceId: ds1.id, codeEnvId: codeEnv.id }).execute()

        actionResult(
            await updateOrgCodeEnvAction({
                orgSlug: org.slug,
                codeEnvId: codeEnv.id,
                name: codeEnv.name,
                identifier: codeEnv.identifier,
                commandLines: codeEnv.commandLines,
                language: codeEnv.language,
                url: codeEnv.url,
                isTesting: false,
                settings: { environment: [] },
                dataSourceIds: [ds2.id],
            }),
        )

        const joinRows = await db
            .selectFrom('orgDataSourceCodeEnv')
            .selectAll('orgDataSourceCodeEnv')
            .where('codeEnvId', '=', codeEnv.id)
            .execute()
        expect(joinRows).toHaveLength(1)
        expect(joinRows[0].dataSourceId).toEqual(ds2.id)
    })

    it('rejects data source from another org when creating code env', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const otherOrg = await insertTestOrg()
        const otherDs = await insertTestDataSource({ orgId: otherOrg.id, name: 'Other DS' })

        const result = await createOrgCodeEnvAction({
            orgSlug: org.slug,
            name: 'Cross Org',
            identifier: 'cross_org',
            commandLines: { r: 'test' },
            language: 'R',
            url: 'test-url',
            starterCodeFileNames: ['test.py'],
            isTesting: true,
            settings: { environment: [] },
            dataSourceIds: [otherDs.id],
        })

        expect(isActionError(result)).toBe(true)
    })

    it('fetchOrgCodeEnvsAction returns linked data sources', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const ds = await insertTestDataSource({ orgId: org.id, name: 'Linked DS' })
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, language: 'R' })

        await db.insertInto('orgDataSourceCodeEnv').values({ dataSourceId: ds.id, codeEnvId: codeEnv.id }).execute()

        const result = actionResult(await fetchOrgCodeEnvsAction({ orgSlug: org.slug }))
        expect(result).toHaveLength(1)
        expect(result[0].dataSources).toHaveLength(1)
        expect(result[0].dataSources[0].name).toEqual('Linked DS')
    })
})

// These audit writes are inline, so the rows are committed by the time the action resolves.
describe('Code Environment audit logging', () => {
    const baseEnv = (orgId: string) => ({
        orgId,
        name: 'Audited Env',
        identifier: 'audited_env',
        commandLines: { r: 'Rscript main.r' },
        language: 'R' as const,
        url: 'repo/img:v1',
        isTesting: false,
        starterCodeFileNames: ['main.r'],
    })

    const updateParams = (orgSlug: string, codeEnvId: string, overrides = {}) => ({
        orgSlug,
        codeEnvId,
        name: 'Audited Env',
        identifier: 'audited_env',
        commandLines: { r: 'Rscript main.r' },
        language: 'R' as const,
        url: 'repo/img:v1',
        isTesting: false,
        settings: { environment: [] },
        dataSourceIds: [],
        ...overrides,
    })

    it('records a CREATED entry with every field and the acting user', async () => {
        const { org, user } = await mockSessionWithTestData({ isAdmin: true })

        const created = actionResult(
            await createOrgCodeEnvAction({
                orgSlug: org.slug,
                name: 'Audited Env',
                identifier: 'audited_env',
                commandLines: { r: 'Rscript main.r' },
                language: 'R',
                url: 'repo/img:v1',
                starterCodeFileNames: ['main.r'],
                isTesting: false,
                settings: { environment: [] },
                dataSourceIds: [],
            }),
        )

        const entries = await getAuditEntriesWithMetadata(created.id, 'CODE_ENV')
        expect(entries).toHaveLength(1)
        expect(entries[0].eventType).toEqual('CREATED')
        expect(entries[0].userId).toEqual(user.id)

        const metadata = codeEnvAuditMetadataSchema.parse(entries[0].metadata)
        expect(metadata.starterCodeReplaced).toBe(true)
        expect(metadata.name).toEqual('Audited Env')
        expect(metadata.changes.find((c) => c.field === 'url')).toEqual({
            field: 'url',
            before: null,
            after: 'repo/img:v1',
        })
    })

    it('records only the field that changed on update', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values(baseEnv(org.id))
            .returningAll()
            .executeTakeFirstOrThrow()

        await updateOrgCodeEnvAction(updateParams(org.slug, codeEnv.id, { url: 'repo/img:v2' }))

        const entries = await getAuditEntriesWithMetadata(codeEnv.id, 'CODE_ENV')
        expect(entries).toHaveLength(1)
        expect(entries[0].eventType).toEqual('UPDATED')

        const metadata = codeEnvAuditMetadataSchema.parse(entries[0].metadata)
        expect(metadata.changes).toEqual([{ field: 'url', before: 'repo/img:v1', after: 'repo/img:v2' }])
    })

    it('records changes to environment variables', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values(baseEnv(org.id))
            .returningAll()
            .executeTakeFirstOrThrow()

        const settings = { environment: [{ name: 'API_KEY', value: 'secret' }] }
        await updateOrgCodeEnvAction(updateParams(org.slug, codeEnv.id, { settings }))

        const entries = await getAuditEntriesWithMetadata(codeEnv.id, 'CODE_ENV')
        const metadata = codeEnvAuditMetadataSchema.parse(entries[0].metadata)
        expect(metadata.changes).toEqual([
            {
                field: 'settings',
                before: { environment: [] },
                after: { environment: [{ name: 'API_KEY', value: REDACTED_ENV_VALUE }] },
            },
        ])
        // The audit row outlives any rotation, so only the name may reach it, never the value.
        expect(JSON.stringify(entries[0].metadata)).not.toContain('secret')
    })

    it('records nothing when a save changes nothing', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values(baseEnv(org.id))
            .returningAll()
            .executeTakeFirstOrThrow()

        await updateOrgCodeEnvAction(updateParams(org.slug, codeEnv.id))

        expect(await getAuditEntriesWithMetadata(codeEnv.id, 'CODE_ENV')).toHaveLength(0)
    })

    it('flags a starter code replacement even when the file names are unchanged', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values(baseEnv(org.id))
            .returningAll()
            .executeTakeFirstOrThrow()

        await updateOrgCodeEnvAction(
            updateParams(org.slug, codeEnv.id, {
                starterCodeFileNames: ['main.r'],
                starterCodeUploaded: true,
            }),
        )

        const entries = await getAuditEntriesWithMetadata(codeEnv.id, 'CODE_ENV')
        expect(entries).toHaveLength(1)

        const metadata = codeEnvAuditMetadataSchema.parse(entries[0].metadata)
        expect(metadata.starterCodeReplaced).toBe(true)
        expect(metadata.changes.some((c) => c.field === 'starterCodeFileNames')).toBe(false)
    })

    it('records both the flag and the diff when starter code file names change', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values(baseEnv(org.id))
            .returningAll()
            .executeTakeFirstOrThrow()

        await updateOrgCodeEnvAction(
            updateParams(org.slug, codeEnv.id, {
                starterCodeFileNames: ['main.r', 'helpers.r'],
                starterCodeUploaded: true,
            }),
        )

        const metadata = codeEnvAuditMetadataSchema.parse(
            (await getAuditEntriesWithMetadata(codeEnv.id, 'CODE_ENV'))[0].metadata,
        )
        expect(metadata.starterCodeReplaced).toBe(true)
        expect(metadata.changes).toEqual([
            { field: 'starterCodeFileNames', before: ['main.r'], after: ['main.r', 'helpers.r'] },
        ])
    })

    it('records a DELETED entry that outlives the code environment', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values(baseEnv(org.id))
            .returningAll()
            .executeTakeFirstOrThrow()
        await insertTestCodeEnv({ orgId: org.id, language: 'R' })

        await deleteOrgCodeEnvAction({ orgSlug: org.slug, codeEnvId: codeEnv.id })

        expect(await db.selectFrom('orgCodeEnv').where('id', '=', codeEnv.id).executeTakeFirst()).toBeUndefined()

        const entries = await getAuditEntriesWithMetadata(codeEnv.id, 'CODE_ENV')
        expect(entries).toHaveLength(1)
        expect(entries[0].eventType).toEqual('DELETED')

        const metadata = codeEnvAuditMetadataSchema.parse(entries[0].metadata)
        expect(metadata.name).toEqual('Audited Env')
        expect(metadata.changes.every((c) => c.after === null)).toBe(true)
    })

    // A deferred audit write would land even though the transaction rolled back, claiming a
    // change that never happened.
    it('writes no audit row when the mutation rolls back', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values(baseEnv(org.id))
            .returningAll()
            .executeTakeFirstOrThrow()

        vi.mocked(insertFakeCodeScan).mockRejectedValueOnce(new Error('simulated post-update failure'))

        const result = await updateOrgCodeEnvAction(updateParams(org.slug, codeEnv.id, { url: 'repo/img:v2' }))

        expect(isActionError(result)).toBe(true)
        expect(await getAuditEntriesWithMetadata(codeEnv.id, 'CODE_ENV')).toHaveLength(0)

        const unchanged = await db
            .selectFrom('orgCodeEnv')
            .select('url')
            .where('id', '=', codeEnv.id)
            .executeTakeFirst()
        expect(unchanged?.url).toEqual('repo/img:v1')
    })

    it('fetchCodeEnvHistoryAction returns entries newest first with the actor name', async () => {
        const { org, user } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values(baseEnv(org.id))
            .returningAll()
            .executeTakeFirstOrThrow()

        await updateOrgCodeEnvAction(updateParams(org.slug, codeEnv.id, { url: 'repo/img:v2' }))
        await updateOrgCodeEnvAction(updateParams(org.slug, codeEnv.id, { url: 'repo/img:v3', name: 'Renamed' }))

        const history = actionResult(await fetchCodeEnvHistoryAction({ orgSlug: org.slug, codeEnvId: codeEnv.id }))
        expect(history).toHaveLength(2)
        expect(history[0].userFullName).toEqual(user.fullName)

        const newest = codeEnvAuditMetadataSchema.parse(history[0].metadata)
        expect(newest.changes.map((c) => c.field)).toContain('name')
    })

    it('fetchCodeEnvHistoryAction does not expose another org history', async () => {
        const otherOrg = await insertTestOrg({ slug: 'other-org-history' })
        const otherEnv = await insertTestCodeEnv({ orgId: otherOrg.id, language: 'R' })
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = await fetchCodeEnvHistoryAction({ orgSlug: org.slug, codeEnvId: otherEnv.id })
        expect(isActionError(result)).toBe(true)
    })

    // The row carries settings.environment (plaintext env vars, often credentials), so this is
    // gated on `view OrgConfig` rather than the unconditioned `view Org` (OTTER-724 / MA-6).
    describe('fetchOrgCodeEnvsAction scoping', () => {
        const insertOrgWithSecret = async (slug: string) => {
            const org = await insertTestOrg({ slug })
            await insertTestCodeEnv({
                orgId: org.id,
                language: 'R',
                environment: [{ name: 'DB_PASSWORD', value: 'super-secret-value' }],
            })
            return org
        }

        it('denies a non-admin member of the same org', async () => {
            const { org } = await mockSessionWithTestData({ isAdmin: false })
            await insertTestCodeEnv({
                orgId: org.id,
                language: 'R',
                environment: [{ name: 'DB_PASSWORD', value: 'super-secret-value' }],
            })

            const result = await fetchOrgCodeEnvsAction({ orgSlug: org.slug })
            expect(isActionError(result)).toBe(true)
            expect(JSON.stringify(result)).not.toContain('super-secret-value')
        })

        it('denies an admin of a different org', async () => {
            const otherOrg = await insertOrgWithSecret('other-org-code-env-scope')
            await mockSessionWithTestData({ isAdmin: true })

            const result = await fetchOrgCodeEnvsAction({ orgSlug: otherOrg.slug })
            expect(isActionError(result)).toBe(true)
            expect(JSON.stringify(result)).not.toContain('super-secret-value')
        })

        it('denies an unknown org slug', async () => {
            await mockSessionWithTestData({ isAdmin: true })

            const result = await fetchOrgCodeEnvsAction({ orgSlug: 'no-such-org-slug' })
            expect(isActionError(result)).toBe(true)
        })

        it('allows an SI admin', async () => {
            const otherOrg = await insertOrgWithSecret('si-admin-readable-code-env')
            await mockSessionWithTestData({ isSiAdmin: true })

            const result = actionResult(await fetchOrgCodeEnvsAction({ orgSlug: otherOrg.slug }))
            expect(result).toHaveLength(1)
        })
    })

    it('fetchStarterCodeAction denies a non-admin member of the org', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false })
        const codeEnv = await insertTestCodeEnv({
            orgId: org.id,
            language: 'R',
            starterCodeFileNames: ['starter.R'],
        })

        const result = await fetchStarterCodeAction({
            orgSlug: org.slug,
            codeEnvId: codeEnv.id,
            fileName: 'starter.R',
        })
        expect(isActionError(result)).toBe(true)
    })
})
