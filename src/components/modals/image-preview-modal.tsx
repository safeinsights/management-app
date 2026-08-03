import { Group } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { DownloadBlobLink } from '@/components/download-blob-link'
import { ImageViewer } from '@/components/file-viewers'

type ImagePreviewModalProps = {
    isVisible: boolean
    name: string
    contents: ArrayBuffer
    mime: string | null
    onClose: () => void
    /** Notified when this modal's own download link is used, so callers can log the download. */
    onDownload?: () => void
}

export function ImagePreviewModal({ isVisible, name, contents, mime, onClose, onDownload }: ImagePreviewModalProps) {
    if (!isVisible || !mime) return null

    const title = (
        <Group gap="md" align="baseline">
            <span>{name}</span>
            <DownloadBlobLink filename={name} fileContent={contents} size="sm" fw={400} onClick={onDownload} />
        </Group>
    )

    return (
        <AppModal isOpen onClose={onClose} title={title} size="xl">
            <ImageViewer name={name} contents={contents} mime={mime} />
        </AppModal>
    )
}
