import { notifications } from '@mantine/notifications'

/**
 * OTTER-693 asks for these to be categorised as Success or Error rather than merely coloured,
 * because later work keys off the category. `data-toast-kind` carries that through to the DOM, so
 * it is readable without parsing copy or inspecting a colour.
 */
export type UploadToastKind = 'success' | 'error'

const show = (kind: UploadToastKind, title: string, message: string) =>
    notifications.show({
        color: kind === 'error' ? 'red' : 'green',
        title,
        message,
        'data-toast-kind': kind,
    })

/** `reason` is what differs between an oversized file and a request that failed outright. */
export const showUploadFailed = (fileName: string, reason: string) =>
    show('error', `${fileName} failed to upload.`, reason)

export const showUploadSucceeded = (fileName: string) => show('success', `${fileName} is uploaded.`, '')
