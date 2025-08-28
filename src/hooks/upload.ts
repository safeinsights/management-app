import { PresignedPost } from '@aws-sdk/s3-presigned-post'
import { useMutation } from '@tanstack/react-query'

export function useUploadFile() {
    return useMutation({
        mutationFn: async ({ file, upload }: { file: File; upload: PresignedPost }) => {
            const body = new FormData()
            for (const [key, value] of Object.entries(upload.fields)) {
                body.append(key, value)
            }
            body.append('file', file)
            const response = await fetch(upload.url, {
                method: 'POST',
                body,
            })
            if (!response.ok) {
                throw new Error(`failed to upload file ${await response.text()}`)
            }
        },
    })
}
