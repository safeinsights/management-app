import { FilePreviewModal } from '@/components/modals/file-preview-modal'
import { ImagePreviewModal } from '@/components/modals/image-preview-modal'
import { decodeFileContents, imageMimeType } from '@/lib/file-content-helpers'

type PreviewFile = {
    name: string
    contents: ArrayBuffer | null
}

// Callers hand over raw bytes so binary files like png plots survive the trip intact;
// decoding to utf-8 happens here and only for non-image files (OTTER-516).
export function FileOrImagePreviewModal({
    file,
    onClose,
    onDownload,
}: {
    file: PreviewFile | null
    onClose: () => void
    /** Notified when the preview's own download link is used (OTTER-675 activity logging). */
    onDownload?: () => void
}) {
    if (!file) return null

    const mime = imageMimeType(file.name)
    if (mime && file.contents) {
        return (
            <ImagePreviewModal
                isVisible
                name={file.name}
                contents={file.contents}
                mime={mime}
                onClose={onClose}
                onDownload={onDownload}
            />
        )
    }

    const textFile = { name: file.name, contents: file.contents === null ? null : decodeFileContents(file.contents) }
    return <FilePreviewModal file={textFile} onClose={onClose} onDownload={onDownload} />
}
