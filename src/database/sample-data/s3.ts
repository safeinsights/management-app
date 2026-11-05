import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export type Upload = { path: string; body: Uint8Array | string; contentType: string }
export type Uploader = { put(upload: Upload): Promise<void> }

// Same rule as s3KeyPrefix + withS3Prefix in src/server/aws/s3.ts, which the seed cannot import.
export function prefixedKey(path: string, rawPrefix: string | undefined): string {
    const trimmed = (rawPrefix ?? '').replace(/^\/+/, '').replace(/\/+$/, '')
    const prefix = trimmed ? `${trimmed}/` : ''
    if (!prefix || path === prefix || path.startsWith(prefix)) return path
    return `${prefix}${path}`
}

export function createUploader(env: Record<string, string | undefined> = process.env): Uploader | null {
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
    }
}
