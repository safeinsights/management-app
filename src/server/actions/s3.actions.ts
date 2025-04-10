'use server'

import { getS3Client, s3BucketName } from '@/server/aws'
import { MinimalJobInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { pathForStudyDocumentFile, pathForStudyJobCode } from '@/lib/paths'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'

export const signedUrlForCodeUpload = async (jobInfo: MinimalJobInfo) => {
    const prefix = pathForStudyJobCode(jobInfo)

    return await createPresignedPost(getS3Client(), {
        Bucket: s3BucketName(),
        Conditions: [['starts-with', '$key', prefix]],
        Expires: 3600,
        Key: prefix + '/${filename}', // single quotes are intentional, S3 will replace ${filename} with the filename
    })
}

// TODO Can this be more generic? or do we need to call a new URL for each path :thinking:
export const signedUrlForStudyFileUpload = async (
    studyInfo: MinimalStudyInfo,
    documentType: StudyDocumentType,
    filename: string,
) => {
    return await createPresignedPost(getS3Client(), {
        Bucket: s3BucketName(),
        Expires: 3600,
        Key: pathForStudyDocumentFile(studyInfo, documentType, filename),
    })
}

export const deleteS3File = async (key: string) => {
    await deleteS3File(key)
}
