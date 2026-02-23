import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData, actionResult, insertTestCodeEnv } from '@/tests/unit.helpers'
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
    }
})

describe('Code Environment Actions', () => {
    it('createOrgCodeEnvAction creates a code environment', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const result = actionResult(
            await createOrgCodeEnvAction({
                orgSlug: org.slug,
                name: 'Test Image',
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                starterCodeFileName: 'test.py',
                isTesting: true,
                settings: { environment: [] },
            }),
        )

        expect(result).toBeDefined()
        expect(result.url).toEqual('test-url')
        expect(result.name).toEqual('Test Image')
        expect(result.starterCodePath).toBeDefined()
    })

    it('deleteOrgCodeEnvAction deletes a code environment', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Test Image to Delete',
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                isTesting: true,
                starterCodePath: 'test/path/to/starter.py',
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await deleteOrgCodeEnvAction({ orgSlug: org.slug, imageId: codeEnv.id })

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
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                isTesting: true,
                starterCodePath: 'test/path/to/starter.py',
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
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodePath: 'test/path/to/starter.py',
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(
            await updateOrgCodeEnvAction({
                orgSlug: org.slug,
                imageId: codeEnv.id,
                name: 'Updated Test Image',
                cmdLine: 'updated command',
                language: 'PYTHON',
                url: 'updated-url',
                isTesting: true,
                settings: { environment: [] },
            }),
        )

        expect(result).toBeDefined()
        expect(result.name).toEqual('Updated Test Image')
        expect(result.cmdLine).toEqual('updated command')
        expect(result.language).toEqual('PYTHON')
        expect(result.url).toEqual('updated-url')
        expect(result.isTesting).toEqual(true)
        expect(result.starterCodePath).toEqual('test/path/to/starter.py') // Should remain unchanged
    })

    it('updateOrgCodeEnvAction updates a code environment with new starter code file', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Test Image to Update',
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodePath: 'test/path/to/old-starter.py',
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(
            await updateOrgCodeEnvAction({
                orgSlug: org.slug,
                imageId: codeEnv.id,
                name: 'Updated Test Image',
                cmdLine: 'updated command',
                language: 'PYTHON',
                url: 'updated-url',
                isTesting: true,
                starterCodeFileName: 'new-starter.py',
                starterCodeUploaded: true,
                settings: { environment: [] },
            }),
        )

        expect(result).toBeDefined()
        expect(result.name).toEqual('Updated Test Image')
        expect(result.starterCodePath).toBeDefined()
        expect(result.starterCodePath).toContain('new-starter.py')
    })

    it('updateOrgCodeEnvAction denies update for non-admin org member', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: false })

        const codeEnv = await db
            .insertInto('orgCodeEnv')
            .values({
                orgId: org.id,
                name: 'Non-admin cannot update',
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodePath: 'test/path/to/starter.R',
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = await updateOrgCodeEnvAction({
            orgSlug: org.slug,
            imageId: codeEnv.id,
            name: 'Attempted Update',
            cmdLine: 'updated command',
            language: 'PYTHON',
            url: 'updated-url',
            isTesting: true,
            settings: { environment: [] },
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
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodePath: 'test/path/to/starter.R',
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(
            await updateOrgCodeEnvAction({
                orgSlug: org.slug,
                imageId: codeEnv.id,
                name: 'Updated by SI admin',
                cmdLine: 'updated command',
                language: 'PYTHON',
                url: 'updated-url',
                isTesting: true,
                settings: { environment: [] },
            }),
        )

        expect(result).toBeDefined()
        expect(result.name).toEqual('Updated by SI admin')
        expect(result.cmdLine).toEqual('updated command')
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

        const result = await deleteOrgCodeEnvAction({ orgSlug: org.slug, imageId: rImage.id })

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

        await deleteOrgCodeEnvAction({ orgSlug: org.slug, imageId: rImage1.id })

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

        await deleteOrgCodeEnvAction({ orgSlug: org.slug, imageId: testingImage.id })

        const deleted = await db.selectFrom('orgCodeEnv').where('id', '=', testingImage.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
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
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                starterCodeFileName: 'test.py',
                isTesting: true,
                settings: { environment },
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
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                starterCodeFileName: 'test.py',
                isTesting: true,
                settings: { environment: [] },
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
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                isTesting: false,
                starterCodePath: 'test/path/to/starter.py',
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
                imageId: codeEnv.id,
                name: 'Test Image',
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                isTesting: false,
                settings: { environment: newEnvironment },
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
                imageId: codeEnv.id,
                name: 'Admin Updated Name',
                cmdLine: 'admin updated command',
                language: 'PYTHON',
                url: 'admin-updated-url',
                isTesting: true,
                settings: { environment: [{ name: 'ADMIN_VAR', value: 'admin_value' }] },
            }),
        )

        expect(result).toBeDefined()
        expect(result.name).toEqual('Admin Updated Name')
        expect(result.cmdLine).toEqual('admin updated command')
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
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                isTesting: true,
                starterCodePath: 'test/path/to/starter.py',
                settings: { environment },
            })
            .execute()

        const result = actionResult(await fetchOrgCodeEnvsAction({ orgSlug: org.slug }))
        expect(result).toHaveLength(1)
        expect((result[0].settings as OrgCodeEnvSettings).environment).toEqual(environment)
    })
})
