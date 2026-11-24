import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export type Upload = { path: string; body: Uint8Array | string; contentType: string }
export type Uploader = {
    put(upload: Upload): Promise<void>
    // Deletes every object under the folder whose path is not in keep.
    prune(folder: string, keep: string[]): Promise<void>
}

// Same rule as s3KeyPrefix + withS3Prefix in src/server/aws/s3.ts, which the seed cannot import.
export function prefixedKey(path: string, rawPrefix: string | undefined): string {
    const trimmed = (rawPrefix ?? '').replace(/^\/+/, '').replace(/\/+$/, '')
    const prefix = trimmed ? `${trimmed}/` : ''
    if (!prefix || path === prefix || path.startsWith(prefix)) return path
    return `${prefix}${path}`
}

export function staleKeys(listed: string[], keep: string[], rawPrefix: string | undefined): string[] {
    const kept = new Set(keep.map((path) => prefixedKey(path, rawPrefix)))
    return listed.filter((key) => !kept.has(key))
}

export function createUploader(env: Record<string, string | undefined>): Uploader | null {
    const bucket = env.BUCKET_NAME
    if (!bucket) return null

    const client = new S3Client({
        region: env.AWS_REGION || 'us-east-1',
        forcePathStyle: true,
        endpoint: env.S3_ENDPOINT,
    })
    const prefix = env.S3_KEY_PREFIX

    return {
        async put({ path, body, contentType }) {
            await client.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: prefixedKey(path, prefix),
                    Body: body,
                    ContentType: contentType,
                }),
            )
        },
        async prune(folder, keep) {
            const listed: string[] = []
            let token: string | undefined
            do {
                const page = await client.send(
                    new ListObjectsV2Command({
                        Bucket: bucket,
                        Prefix: `${prefixedKey(folder, prefix)}/`,
                        ContinuationToken: token,
                    }),
                )
                listed.push(...(page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : [])))
                token = page.NextContinuationToken
            } while (token)

            const stale = staleKeys(listed, keep, prefix)
            for (let i = 0; i < stale.length; i += 1000) {
                await client.send(
                    new DeleteObjectsCommand({
                        Bucket: bucket,
                        Delete: { Objects: stale.slice(i, i + 1000).map((Key) => ({ Key })) },
                    }),
                )
            }
        },
    }
}
