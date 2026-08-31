import { Center, Group, Loader } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { DownloadBlobLink } from '@/components/download-blob-link'
import { FileViewer } from '@/components/file-viewers'

export function FilePreviewModal({
    file,
    onClose,
    onDownload,
}: {
    file: { name: string; contents: string | null } | null
    onClose: () => void
    /** Notified when the in-modal download link is used, so callers can log the download. */
    onDownload?: () => void
}) {
    if (!file) return null
    const isLoading = file.contents === null
    const title = (
        <Group gap="md" align="baseline">
            <span>{file.name}</span>
            {!isLoading && (
                <DownloadBlobLink
                    filename={file.name}
                    fileContent={file.contents ?? ''}
                    size="sm"
                    fw={400}
                    onClick={onDownload}
                />
            )}
        </Group>
    )
    return (
        <AppModal isOpen onClose={onClose} title={title} size="xl" styles={{ body: { padding: 0 } }}>
            {isLoading ? (
                <Center h={500} data-testid="file-preview-loading">
                    <Loader />
                </Center>
            ) : (
                <FileViewer path={file.name} text={file.contents ?? ''} />
            )}
        </AppModal>
    )
}
