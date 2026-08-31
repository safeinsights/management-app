// Exercises S3 operations (checksums, presigned URLs, batch deletes) against
// the SeaweedFS S3-compatible API. MinIO was previously used but removed (unmaintained).
//
// Locally: tests skip cleanly when SeaweedFS isn't reachable so devs without
// `docker compose up seaweedfs` aren't blocked. On CI (CI env var set), the
// probe instead throws — a missing service is a CI setup bug, not a
// "skip and move on" condition. See tests/s3.helpers.ts.

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
    createSignedUploadUrlForKey,
    withS3Prefix,
} from './aws'
import { s3Available } from '@/tests/s3.helpers'
import type { PresignedPost } from '@aws-sdk/s3-presigned-post'
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

// The policy is signed against S3_BROWSER_ENDPOINT, which is host-facing and not routable from in
// here. A POST policy's signature covers the policy document, not the Host header, so re-pointing
// the same form at the internal endpoint exercises the real signed policy over a reachable route.
function reachableFromTests(url: string) {
    const internal = process.env.S3_ENDPOINT
    if (!internal) return url

    const target = new URL(url)
    target.host = new URL(internal).host
    return target.toString()
}

// Posts the presigned form the way a browser would, so the policy is exercised rather than inspected.
async function postSignedUpload(upload: PresignedPost, body: string) {
    const form = new FormData()
    for (const [name, value] of Object.entries(upload.fields)) {
        form.append(name, value)
    }
    form.append('file', new Blob([body]), 'agreement.pdf')

    return await fetch(reachableFromTests(upload.url), { method: 'POST', body: form })
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

describe.skipIf(!s3Available)('S3 integration', () => {
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

    // The legal-document upload signs the whole key rather than a prefix, because the stored
    // file_path is itself the record of what was filed — the browser must not be able to put the
    // object anywhere else. Every unit test stubs this, so the round trip is only covered here.
    it('signs an upload for one exact key and lands the object there', async () => {
        const path = `${TEST_PREFIX}exact-key/agreement.pdf`
        const upload = await createSignedUploadUrlForKey(path)

        expect(upload.fields.key).toBe(withS3Prefix(path))

        const response = await postSignedUpload(upload, 'signed agreement bytes')
        expect(response.ok).toBe(true)

        expect(await readableToString(await fetchS3File(path))).toBe('signed agreement bytes')
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
