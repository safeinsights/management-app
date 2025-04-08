'use server'

import { generateSignedUrlForUpload } from '@/server/aws'

export const getSignedURL = async (key: string) => {
    return await generateSignedUrlForUpload(key)
}

export const deleteS3File = async (key: string) => {
    await deleteS3File(key)
}
