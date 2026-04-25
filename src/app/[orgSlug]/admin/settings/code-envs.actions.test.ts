import { describe, expect, it, vi } from 'vitest'
import {
    mockSessionWithTestData,
    actionResult,
    insertTestCodeEnv,
    insertTestDataSource,
    insertTestOrg,
} from '@/tests/unit.helpers'
import {
    createOrgCodeEnvAction,
    deleteOrgCodeEnvAction,
    fetchOrgCodeEnvsAction,
    updateOrgCodeEnvAction,
} from './code-envs.actions'
import { db } from '@/database'
import { isActionError } from '@/lib/errors'
import { OrgCodeEnvSettings } from '@/database/types'

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
        expect(result.starterCodeFileNames).toEqual(['starter.py']) // Should remain unchanged
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
