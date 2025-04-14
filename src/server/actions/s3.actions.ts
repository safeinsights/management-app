'use server'

import { getS3Client, s3BucketName } from '@/server/aws'
import { MinimalJobInfo, minimalJobInfoSchema, minimalStudyInfoSchema, StudyDocumentType } from '@/lib/types'
import { pathForStudyDocumentFile, pathForStudyJobCode } from '@/lib/paths'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { userAction, z } from '@/server/actions/wrappers'

export const signedUrlForCodeUploadAction = userAction(async (jobInfo: MinimalJobInfo) => {
    const prefix = pathForStudyJobCode(jobInfo)

    return await createPresignedPost(getS3Client(), {
        Bucket: s3BucketName(),
        Conditions: [['starts-with', '$key', prefix]],
        Expires: 3600,
        Key: prefix + '/${filename}', // single quotes are intentional, S3 will replace ${filename} with the filename
    })
}, minimalJobInfoSchema)

// TODO Can this be more generic? or do we need to call a new URL for each path :thinking:
export const signedUrlForStudyFileUploadAction = userAction(
    async ({ studyInfo, documentType, filename }) => {
        return await createPresignedPost(getS3Client(), {
            Bucket: s3BucketName(),
            Expires: 3600,
            Key: pathForStudyDocumentFile(studyInfo, documentType, filename),
        })
    },
    z.object({
        studyInfo: minimalStudyInfoSchema,
        documentType: z.nativeEnum(StudyDocumentType),
        filename: z.string(),
    }),
)
