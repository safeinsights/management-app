'use server'

import { generateSignedUrlForUpload } from '@/server/aws'

export const uploadStudyDocumentFile = async (key: string) => {
    const preSignedURL = await generateSignedUrlForUpload(key)
}

export const deleteS3File = async (key: string) => {
    await deleteS3File(key)
}
