import {
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Upload } from '@aws-sdk/lib-storage'
import type { LegalDocumentType } from '@/database/types'
import { pathForSampleData } from '@/lib/paths'
import type { MinimalCodeEnvInfo } from '@/lib/types'
import { Readable } from 'stream'
import { MinimalJobInfo, MinimalOrgInfo, MinimalStudyInfo } from '@/lib/types'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import logger from '@/lib/logger'
import { env } from '@/server/config'
import { getS3BrowserClient, getS3Client, objectToAWSTags } from './clients'

export const s3BucketName = () => {
    if (!env.BUCKET_NAME) {
        throw new Error('BUCKET_NAME env var not set')
    }
    return env.BUCKET_NAME
}

// Lets multiple environments share one bucket without colliding; a no-op when unset.
export const s3KeyPrefix = (): string => {
    const raw = env.S3_KEY_PREFIX
    if (!raw) return ''
    const trimmed = raw.replace(/^\/+/, '').replace(/\/+$/, '')
    return trimmed ? `${trimmed}/` : ''
}

// Idempotent, so keys returned by a List call can be re-submitted without double-prefixing.
export const withS3Prefix = (keyOrPrefix: string): string => {
    const prefix = s3KeyPrefix()
    if (!prefix || keyOrPrefix === prefix || keyOrPrefix.startsWith(prefix)) return keyOrPrefix
    return `${prefix}${keyOrPrefix}`
}

export const completePathForSampleData = (parts: MinimalCodeEnvInfo & { sampleDataPath?: string }) =>
    `s3://${s3BucketName()}/${withS3Prefix(pathForSampleData(parts))}`

export const storeS3File = async (
    info: MinimalStudyInfo | MinimalJobInfo | MinimalOrgInfo | { legalDocumentType: LegalDocumentType },
    body: ReadableStream,
    Key: string,
) => {
    const uploader = new Upload({
        client: getS3Client(),
        tags: objectToAWSTags(info),
        params: {
            Bucket: s3BucketName(),
            Key: withS3Prefix(Key),
            Body: body,
        },
    })
    await uploader.done()
}

export async function signedUrlForFile(
    Key: string,
    commandOverrides: Partial<{ ResponseContentDisposition: string; ResponseContentType: string }> = {},
) {
    return await getSignedUrl(
        getS3BrowserClient(),
        new GetObjectCommand({ Bucket: s3BucketName(), Key: withS3Prefix(Key), ...commandOverrides }),
        { expiresIn: 3600 },
    )
}

export const createSignedUploadUrl = async (path: string) => {
    const prefixedPath = withS3Prefix(path)
    return await createPresignedPost(getS3BrowserClient(), {
        Bucket: s3BucketName(),
        Expires: 3600,
        Conditions: [['starts-with', '$key', prefixedPath]],
        Key: prefixedPath + '/${filename}', // single quotes intentional: S3 substitutes ${filename}
    })
}

export const deleteS3File = async (Key: string) => {
    await getS3Client().send(
        new DeleteObjectCommand({
            Bucket: s3BucketName(),
            Key: withS3Prefix(Key),
        }),
    )
}

export const deleteFolderContents = async (folderPath: string) => {
    const listCommand = new ListObjectsV2Command({
        Bucket: s3BucketName(),
        Prefix: withS3Prefix(folderPath),
    })

    const listedObjects = await getS3Client().send(listCommand)

    if (!listedObjects.Contents) {
        logger.info('No objects found in the folder.')
        return
    }

    const objectsToDelete = listedObjects.Contents.map(({ Key }) => ({ Key }))

    if (objectsToDelete.length > 20) {
        throw new Error('cowardly refusing to delete more than 10 files at once')
    }

    const deleteCommand = new DeleteObjectsCommand({
        Bucket: s3BucketName(),
        Delete: { Objects: objectsToDelete },
    })

    await getS3Client().send(deleteCommand)
}

export const moveFolderContents = async (oldPrefix: string, newPrefix: string) => {
    const Bucket = s3BucketName()
    const prefixedOld = withS3Prefix(oldPrefix)
    const prefixedNew = withS3Prefix(newPrefix)
    const listedObjects = await getS3Client().send(new ListObjectsV2Command({ Bucket, Prefix: prefixedOld }))

    if (!listedObjects.Contents?.length) return

    for (const obj of listedObjects.Contents) {
        if (!obj.Key) continue
        const suffix = obj.Key.slice(prefixedOld.length)
        const newKey = prefixedNew + suffix
        await getS3Client().send(new CopyObjectCommand({ Bucket, CopySource: `${Bucket}/${obj.Key}`, Key: newKey }))
    }

    await getS3Client().send(
        new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: listedObjects.Contents.map(({ Key }) => ({ Key })) },
        }),
    )
}

export async function fetchS3File(Key: string) {
    const result = await getS3Client().send(new GetObjectCommand({ Bucket: s3BucketName(), Key: withS3Prefix(Key) }))
    if (!result.Body) throw new Error(`no file received from s3 for path ${Key}`)
    return result.Body as Readable
}
