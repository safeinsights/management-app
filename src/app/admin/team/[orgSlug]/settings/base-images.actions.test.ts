import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import { createOrgBaseImageAction, deleteOrgBaseImageAction, fetchOrgBaseImagesAction } from './base-images.actions'
import { db } from '@/database'

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
})
