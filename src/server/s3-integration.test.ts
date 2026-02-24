// Exercises S3 operations (checksums, presigned URLs, batch deletes) against
// the SeaweedFS S3-compatible API. MinIO was previously used but removed (unmaintained).

import { describe, it, expect, afterAll } from 'vitest'
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import {
    getS3Client,
    s3BucketName,
    fetchS3File,
    deleteS3File,
    storeS3File,
    deleteFolderContents,
    signedUrlForFile,
    createSignedUploadUrl,
} from './aws'
import { Readable } from 'stream'

const TEST_PREFIX = `s3-integration-test-${Date.now()}/`

function toReadableStream(content: string): ReadableStream {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(content))
            controller.close()
        },
    })
}

async function readableToString(readable: Readable): Promise<string> {
    const chunks: Buffer[] = []
    for await (const chunk of readable) {
        chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks).toString('utf-8')
}

async function cleanupTestObjects(client: S3Client, bucket: string) {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: TEST_PREFIX }))
    if (!listed.Contents?.length) return

    await client.send(
        new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: listed.Contents.map(({ Key }) => ({ Key })) },
        }),
    )
}

describe('S3 integration', () => {
    const client = getS3Client()
    const bucket = s3BucketName()

    afterAll(async () => {
        await cleanupTestObjects(client, bucket)
    })

    it('uploads via Upload class and reads back with GetObject', async () => {
        const key = `${TEST_PREFIX}upload-test.txt`
        const content = 'hello from integration test'

        const uploader = new Upload({
            client,
            params: { Bucket: bucket, Key: key, Body: toReadableStream(content) },
        })
        await uploader.done()

        const body = await fetchS3File(key)
        const result = await readableToString(body)
        expect(result).toBe(content)
    })

    it('uploads via storeS3File with SHA256 checksum and reads back', async () => {
        const key = `${TEST_PREFIX}store-s3-file-test.txt`
        const content = 'storeS3File checksum integration test'

        await storeS3File({ orgSlug: 'test-org' }, toReadableStream(content), key)

        const body = await fetchS3File(key)
        const result = await readableToString(body)
        expect(result).toBe(content)
    })

    it('lists objects by prefix with ListObjectsV2', async () => {
        const key = `${TEST_PREFIX}list-test.txt`
        const uploader = new Upload({
            client,
            params: { Bucket: bucket, Key: key, Body: toReadableStream('list me') },
        })
        await uploader.done()

        const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: TEST_PREFIX }))

        const keys = listed.Contents?.map((o) => o.Key) ?? []
        expect(keys).toContain(key)
    })

    it('generates a presigned GET URL', async () => {
        const key = `${TEST_PREFIX}presigned-get.txt`
        const uploader = new Upload({
            client,
            params: { Bucket: bucket, Key: key, Body: toReadableStream('presigned content') },
        })
        await uploader.done()

        const url = await signedUrlForFile(key)

        expect(url).toContain(key)
        expect(url).toMatch(/^https?:\/\//)
    })

    it('generates a presigned POST policy', async () => {
        const path = `${TEST_PREFIX}presigned-post/`

        const result = await createSignedUploadUrl(path)

        expect(result.url).toMatch(/^https?:\/\//)
        expect(result.fields).toBeDefined()
    })

    it('deletes a single object with DeleteObject', async () => {
        const key = `${TEST_PREFIX}delete-single.txt`
        const uploader = new Upload({
            client,
            params: { Bucket: bucket, Key: key, Body: toReadableStream('delete me') },
        })
        await uploader.done()

        await deleteS3File(key)

        await expect(client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).rejects.toThrow()
    })

    it('batch deletes objects with DeleteObjects', async () => {
        const keys = [`${TEST_PREFIX}batch/a.txt`, `${TEST_PREFIX}batch/b.txt`, `${TEST_PREFIX}batch/c.txt`]

        for (const key of keys) {
            const uploader = new Upload({
                client,
                params: { Bucket: bucket, Key: key, Body: toReadableStream(`content of ${key}`) },
            })
            await uploader.done()
        }

        const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${TEST_PREFIX}batch/` }))
        expect(listed.Contents?.length).toBe(3)

        await client.send(
            new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: { Objects: keys.map((Key) => ({ Key })) },
            }),
        )

        const afterDelete = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: `${TEST_PREFIX}batch/` }),
        )
        expect(afterDelete.Contents ?? []).toHaveLength(0)
    })

    it('deletes folder contents via deleteFolderContents', async () => {
        const folder = `${TEST_PREFIX}folder-delete/`
        const keys = [`${folder}a.txt`, `${folder}b.txt`, `${folder}c.txt`]

        for (const key of keys) {
            const uploader = new Upload({
                client,
                params: { Bucket: bucket, Key: key, Body: toReadableStream(`content of ${key}`) },
            })
            await uploader.done()
        }

        await deleteFolderContents(folder)

        const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: folder }))
        expect(listed.Contents ?? []).toHaveLength(0)
    })

    it('deleteFolderContents refuses to delete more than 20 objects', async () => {
        const folder = `${TEST_PREFIX}folder-overflow/`
        const keys = Array.from({ length: 21 }, (_, i) => `${folder}file-${i}.txt`)

        for (const key of keys) {
            const uploader = new Upload({
                client,
                params: { Bucket: bucket, Key: key, Body: toReadableStream('x') },
            })
            await uploader.done()
        }

        await expect(deleteFolderContents(folder)).rejects.toThrow('cowardly refusing')
    })

    it('deleteFolderContents handles empty folder gracefully', async () => {
        const folder = `${TEST_PREFIX}folder-empty/`
        await expect(deleteFolderContents(folder)).resolves.toBeUndefined()
    })

    it('fetchS3File throws for a non-existent key', async () => {
        const key = `${TEST_PREFIX}does-not-exist.txt`
        await expect(fetchS3File(key)).rejects.toThrow()
    })
})
