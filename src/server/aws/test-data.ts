import { CopyObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import logger from '@/lib/logger'
import { env } from '@/server/config'
import { getS3Client } from './clients'
import { sanitizeColumnName } from './naming'
import { s3BucketName, withS3Prefix } from './s3'

export const testDataBucketName = (): string | null => env.TEST_DATA_BUCKET_NAME || null

export type CopiedTable = { tableName: string; sourceKey: string }

export async function copyToTestDataBucket(sourcePrefix: string, targetPrefix: string): Promise<CopiedTable[]> {
    const bucket = testDataBucketName()
    if (!bucket) {
        logger.error('TEST_DATA_BUCKET_NAME not configured, skipping copy to test-data bucket')
        return []
    }

    const sourceBucket = s3BucketName()
    const listed = await getS3Client().send(
        new ListObjectsV2Command({ Bucket: sourceBucket, Prefix: withS3Prefix(sourcePrefix) }),
    )
    if (!listed.Contents?.length) return []

    const tables: CopiedTable[] = []
    for (const obj of listed.Contents) {
        if (!obj.Key) continue
        const fileName = obj.Key.split('/').pop() || ''
        if (!fileName.toLowerCase().endsWith('.csv')) continue
        const tableName = sanitizeColumnName(fileName.replace(/\.csv$/i, ''))
        tables.push({ tableName, sourceKey: obj.Key })

        const targetKey = `${targetPrefix}/${tableName}/${fileName}`
        await getS3Client().send(
            new CopyObjectCommand({
                Bucket: bucket,
                CopySource: `${sourceBucket}/${obj.Key}`,
                Key: targetKey,
            }),
        )
    }
    return tables
}

export async function deleteTestDataBucketPrefix(prefix: string) {
    const bucket = testDataBucketName()
    if (!bucket) return

    const listed = await getS3Client().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))
    if (!listed.Contents?.length) return

    const objectsToDelete = listed.Contents.map(({ Key }) => ({ Key }))
    await getS3Client().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objectsToDelete } }))
}
