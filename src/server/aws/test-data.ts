import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { env } from '@/server/config'
import { getS3Client } from './clients'

export const testDataBucketName = (): string | null => env.TEST_DATA_BUCKET_NAME || null

export async function deleteTestDataBucketPrefix(prefix: string) {
    const bucket = testDataBucketName()
    if (!bucket) return

    const listed = await getS3Client().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))
    if (!listed.Contents?.length) return

    const objectsToDelete = listed.Contents.map(({ Key }) => ({ Key }))
    await getS3Client().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objectsToDelete } }))
}
