import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import {
    createStarterCodeAction,
    deleteStarterCodeAction,
    fetchStarterCodesAction,
    downloadStarterCodeAction,
} from './starter-code.actions'
import { db } from '@/database'
import * as aws from '@/server/aws'

// Mock S3 functions
vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        storeS3File: vi.fn(),
        s3BucketName: vi.fn(() => 'test-bucket'),
        signedUrlForFile: vi.fn(() => Promise.resolve('https://signed-url.example.com')),
        getS3Client: vi.fn(() => ({
            send: vi.fn(),
        })),
    }
})

describe('Starter Code Actions', () => {
    it('createStarterCodeAction creates starter code', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const file = new File(['test content'], 'test.r', { type: 'text/plain' })
        const starterCodeData = {
            name: 'Test Starter Code',
            language: 'r' as const,
            file,
        }

        const result = actionResult(await createStarterCodeAction({ orgSlug: org.slug, ...starterCodeData }))
        expect(result).toBeDefined()
        expect(result.name).toEqual(starterCodeData.name)
        expect(result.language).toEqual(starterCodeData.language)
        expect(result.fileName).toEqual('test.r')
        expect(result.url).toContain('s3://')
        expect(aws.storeS3File).toHaveBeenCalled()
    })

    it('deleteStarterCodeAction deletes starter code', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const starterCode = await db
            .insertInto('orgStarterCode')
            .values({
                orgId: org.id,
                name: 'Test Code to Delete',
                language: 'python',
                fileName: 'test.py',
                url: 's3://test-bucket/starter-code/test.py',
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await deleteStarterCodeAction({ orgSlug: org.slug, id: starterCode.id })

        const deletedCode = await db.selectFrom('orgStarterCode').where('id', '=', starterCode.id).executeTakeFirst()
        expect(deletedCode).toBeUndefined()
    })

    it('fetchStarterCodesAction fetches starter codes', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        await db
            .insertInto('orgStarterCode')
            .values({
                orgId: org.id,
                name: 'Test Code to Fetch',
                language: 'r',
                fileName: 'starter.r',
                url: 's3://test-bucket/starter-code/starter.r',
            })
            .execute()

        const result = actionResult(await fetchStarterCodesAction({ orgSlug: org.slug }))
        expect(result).toHaveLength(1)
        expect(result[0].name).toEqual('Test Code to Fetch')
    })

    it('downloadStarterCodeAction generates download URL', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const starterCode = await db
            .insertInto('orgStarterCode')
            .values({
                orgId: org.id,
                name: 'Test Code to Download',
                language: 'r',
                fileName: 'download.r',
                url: 's3://test-bucket/starter-code/download.r',
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(await downloadStarterCodeAction({ orgSlug: org.slug, id: starterCode.id }))
        expect(result.url).toEqual('https://signed-url.example.com')
        expect(result.fileName).toEqual('download.r')
        expect(aws.signedUrlForFile).toHaveBeenCalled()
    })
})
