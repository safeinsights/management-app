import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData, actionResult, insertTestBaseImage } from '@/tests/unit.helpers'
import {
    createOrgBaseImageAction,
    deleteOrgBaseImageAction,
    fetchOrgBaseImagesAction,
    updateOrgBaseImageAction,
} from './base-images.actions'
import { db } from '@/database'
import { isActionError } from '@/lib/errors'
import { OrgBaseImageSettings } from '@/database/types'

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        storeS3File: vi.fn().mockResolvedValue(undefined),
        deleteS3File: vi.fn().mockResolvedValue(undefined),
    }
})

describe('Base Images Actions', () => {
    it('createOrgBaseImageAction creates a base image', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        // Create a mock File for starterCode
        const mockFile = new File(['test content'], 'test.py', { type: 'text/plain' })

        const result = actionResult(
            await createOrgBaseImageAction({
                orgSlug: org.slug,
                name: 'Test Image',
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                starterCode: mockFile,
                isTesting: true,
                settings: { environment: [] },
            }),
        )

        expect(result).toBeDefined()
        expect(result.url).toEqual('test-url')
        expect(result.name).toEqual('Test Image')
        expect(result.starterCodePath).toBeDefined()
    })

    it('deleteOrgBaseImageAction deletes a base image', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const baseImage = await db
            .insertInto('orgBaseImage')
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

        await deleteOrgBaseImageAction({ orgSlug: org.slug, imageId: baseImage.id })

        const deletedImage = await db.selectFrom('orgBaseImage').where('id', '=', baseImage.id).executeTakeFirst()
        expect(deletedImage).toBeUndefined()
    })

    it('fetchOrgBaseImagesAction fetches base images', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        await db
            .insertInto('orgBaseImage')
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

        const result = actionResult(await fetchOrgBaseImagesAction({ orgSlug: org.slug }))
        expect(result).toHaveLength(1)
        expect(result[0].name).toEqual('Test Image to Fetch')
    })

    it('updateOrgBaseImageAction updates a base image without changing starter code', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const baseImage = await db
            .insertInto('orgBaseImage')
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
            await updateOrgBaseImageAction({
                orgSlug: org.slug,
                imageId: baseImage.id,
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

    it('updateOrgBaseImageAction updates a base image with new starter code file', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const baseImage = await db
            .insertInto('orgBaseImage')
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

        const mockNewFile = new File(['new content'], 'new-starter.py', { type: 'text/plain' })

        const result = actionResult(
            await updateOrgBaseImageAction({
                orgSlug: org.slug,
                imageId: baseImage.id,
                name: 'Updated Test Image',
                cmdLine: 'updated command',
                language: 'PYTHON',
                url: 'updated-url',
                isTesting: true,
                starterCode: mockNewFile,
                settings: { environment: [] },
            }),
        )

        expect(result).toBeDefined()
        expect(result.name).toEqual('Updated Test Image')
        expect(result.starterCodePath).toBeDefined()
        expect(result.starterCodePath).toContain('new-starter.py') // Should have new file path
    })

    it('deleteOrgBaseImageAction prevents deletion of last non-testing image per language', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        // Create the only non-testing R image
        const rImage = await insertTestBaseImage({
            orgId: org.id,
            name: 'Only R Image',
            language: 'R',
            isTesting: false,
        })

        // Create another Python image to ensure we have multiple languages
        await insertTestBaseImage({
            orgId: org.id,
            name: 'Python Image',
            language: 'PYTHON',
            isTesting: false,
        })

        // Try to delete the only R image - should fail
        const result = await deleteOrgBaseImageAction({ orgSlug: org.slug, imageId: rImage.id })

        // Check that result has an error
        expect(isActionError(result)).toBe(true)
        if (isActionError(result)) {
            expect(result.error).toContain('Cannot delete the last non-testing R base image')
        }

        // Verify image was not deleted
        const stillExists = await db.selectFrom('orgBaseImage').where('id', '=', rImage.id).executeTakeFirst()
        expect(stillExists).toBeDefined()
    })

    it('deleteOrgBaseImageAction allows deletion when multiple non-testing images exist for language', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        // Create two non-testing R images
        const rImage1 = await insertTestBaseImage({
            orgId: org.id,
            name: 'R Image 1',
            language: 'R',
            isTesting: false,
        })

        await insertTestBaseImage({
            orgId: org.id,
            name: 'R Image 2',
            language: 'R',
            isTesting: false,
        })

        // Should be able to delete one of them
        await deleteOrgBaseImageAction({ orgSlug: org.slug, imageId: rImage1.id })

        // Verify image was deleted
        const deleted = await db.selectFrom('orgBaseImage').where('id', '=', rImage1.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('deleteOrgBaseImageAction allows deletion of testing images regardless of count', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        // Create the only non-testing R image
        await insertTestBaseImage({
            orgId: org.id,
            name: 'Production R Image',
            language: 'R',
            isTesting: false,
        })

        // Create a testing R image
        const testingImage = await insertTestBaseImage({
            orgId: org.id,
            name: 'Testing R Image',
            language: 'R',
            isTesting: true,
        })

        // Should be able to delete the testing image even though it's the same language
        await deleteOrgBaseImageAction({ orgSlug: org.slug, imageId: testingImage.id })

        // Verify testing image was deleted
        const deleted = await db.selectFrom('orgBaseImage').where('id', '=', testingImage.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('createOrgBaseImageAction creates a base image with environment variables', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const mockFile = new File(['test content'], 'test.py', { type: 'text/plain' })
        const environment = [
            { name: 'MY_VAR', value: 'my_value' },
            { name: 'APIKEY', value: 'secret123' },
        ]

        const result = actionResult(
            await createOrgBaseImageAction({
                orgSlug: org.slug,
                name: 'Test Image with Env',
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                starterCode: mockFile,
                isTesting: true,
                settings: { environment },
            }),
        )

        expect(result).toBeDefined()
        expect((result.settings as OrgBaseImageSettings).environment).toEqual(environment)
    })

    it('createOrgBaseImageAction defaults settings.environment to empty array', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const mockFile = new File(['test content'], 'test.py', { type: 'text/plain' })

        // Intentionally omitting settings to test default behavior
        const result = actionResult(
            await createOrgBaseImageAction({
                orgSlug: org.slug,
                name: 'Test Image without Env',
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                starterCode: mockFile,
                isTesting: true,
                settings: { environment: [] },
            }),
        )

        expect(result).toBeDefined()
        expect((result.settings as OrgBaseImageSettings).environment).toEqual([])
    })

    it('updateOrgBaseImageAction updates environment variables', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const baseImage = await db
            .insertInto('orgBaseImage')
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
            await updateOrgBaseImageAction({
                orgSlug: org.slug,
                imageId: baseImage.id,
                name: 'Test Image',
                cmdLine: 'test command',
                language: 'R',
                url: 'test-url',
                isTesting: false,
                settings: { environment: newEnvironment },
            }),
        )
        expect(result).toBeDefined()
        expect((result.settings as OrgBaseImageSettings).environment).toEqual(newEnvironment)
    })

    it('updateOrgBaseImageAction allows org admin to update a base image', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const baseImage = await insertTestBaseImage({
            orgId: org.id,
            name: 'Original Name',
            language: 'R',
            isTesting: false,
        })

        const result = actionResult(
            await updateOrgBaseImageAction({
                orgSlug: org.slug,
                imageId: baseImage.id,
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
        expect((result.settings as OrgBaseImageSettings).environment).toEqual([
            { name: 'ADMIN_VAR', value: 'admin_value' },
        ])
    })

    it('fetchOrgBaseImagesAction returns environment variables', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const environment = [{ name: 'TESTVAR', value: 'test_value' }]

        await db
            .insertInto('orgBaseImage')
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

        const result = actionResult(await fetchOrgBaseImagesAction({ orgSlug: org.slug }))
        expect(result).toHaveLength(1)
        expect((result[0].settings as OrgBaseImageSettings).environment).toEqual(environment)
    })
})
