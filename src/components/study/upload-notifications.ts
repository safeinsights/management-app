import { showToast } from '@/components/toast-notifications'

/** `reason` is what differs between an oversized file and a request that failed outright. */
export const showUploadFailed = (fileName: string, reason: string) =>
    showToast({ category: 'error', title: `${fileName} failed to upload.`, message: reason })

export const showUploadSucceeded = (fileName: string) =>
    showToast({ category: 'success', title: `${fileName} is uploaded.` })
