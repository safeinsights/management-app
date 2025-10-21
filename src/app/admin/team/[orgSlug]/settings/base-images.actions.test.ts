import { describe, expect, it } from 'vitest'
import { mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import { createOrgBaseImageAction, deleteOrgBaseImageAction, fetchOrgBaseImagesAction } from './base-images.actions'
import { db } from '@/database'

describe('Base Images Actions', () => {
    it('createOrgBaseImageAction creates a base image', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const baseImageData = {
            name: 'Test Image',
            cmdLine: 'test command',
            language: 'R' as const,
            url: 'test-url',
            isTesting: true,
        }

        const formData = new FormData()
        formData.append('name', baseImageData.name)
        formData.append('cmdLine', baseImageData.cmdLine)
        formData.append('language', baseImageData.language)
        formData.append('url', baseImageData.url)
        formData.append('isTesting', baseImageData.isTesting.toString())
        formData.append('skeletonCode', new File(['test content'], 'test.txt'))

        const result = actionResult(await createOrgBaseImageAction({ orgSlug: org.slug, formData }))
        expect(result).toBeDefined()
        expect(result.url).toEqual(baseImageData.url)
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
            })
            .execute()

        const result = actionResult(await fetchOrgBaseImagesAction({ orgSlug: org.slug }))
        expect(result).toHaveLength(1)
        expect(result[0].name).toEqual('Test Image to Fetch')
    })
})
