'use server'

import { getS3Client, s3BucketName } from '@/server/aws'
import { MinimalJobInfo, minimalJobInfoSchema } from '@/lib/types'
import { pathForStudyJobCode } from '@/lib/paths'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { userAction, z } from '@/server/actions/wrappers'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'

export const signedUrlForCodeUploadAction = userAction(async (jobInfo: MinimalJobInfo) => {
    const prefix = pathForStudyJobCode(jobInfo)

    return await createPresignedPost(getS3Client(), {
        Bucket: s3BucketName(),
        Conditions: [['starts-with', '$key', prefix]],
        Expires: 3600,
        Key: prefix + '/${filename}', // single quotes are intentional, S3 will replace ${filename} with the filename
    })
}, minimalJobInfoSchema)

export const signedUrlForStudyFileUploadAction = userAction(async (path: string) => {
    return await createPresignedPost(getS3Client(), {
        Bucket: s3BucketName(),
        Expires: 3600,
        Conditions: [['starts-with', '$key', path]],
        Key: path + '/${filename}', // single quotes are intentional, S3 will replace ${filename} with the filename
    })
}, z.string())

export const signedUrlForDeletingStudyFiles = userAction(async (Key: string) => {
    return await getSignedUrl(getS3Client(), new DeleteObjectCommand({ Bucket: s3BucketName(), Key }), {
        expiresIn: 3600,
    })
}, z.string())
