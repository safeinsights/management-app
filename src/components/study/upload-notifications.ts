import { showToast } from '@/components/toast-notifications'

/** `reason` is what differs between an oversized file and a request that failed outright. */
export const showUploadFailed = (fileName: string, reason: string) =>
    showToast('error', `${fileName} failed to upload.`, reason)

export const showUploadSucceeded = (fileName: string) => showToast('success', `${fileName} is uploaded.`, '')
