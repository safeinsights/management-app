import { type PresignedPost } from '@aws-sdk/s3-presigned-post'
import logger from '@/lib/logger'

async function uploadFile(file: File, upload: PresignedPost) {
    const body = new FormData()
    for (const [key, value] of Object.entries(upload.fields)) {
        body.append(key, value)
    }
    body.append('file', file)
    const failureMsg = `An error occurred when uploading ${file.name}, please remove it and attempt to re-upload it.`
    try {
        const response = await fetch(upload.url, {
            method: 'POST',
            body,
        })
        if (!response.ok) {
            logger.error(`Upload failed with status ${response.status}: ${response.statusText}`)
            throw new Error(failureMsg)
        }
    } catch (error) {
        logger.error(`Upload error: ${error}`)
        throw new Error(failureMsg)
    }
}

export type FileUpload = [File | null, PresignedPost]

export function uploadFiles(files: FileUpload[]) {
    return Promise.all(
        files.map(([file, upload]) => {
            if (!file) return Promise.resolve(null)
            return uploadFile(file, upload)
        }),
    )
}
