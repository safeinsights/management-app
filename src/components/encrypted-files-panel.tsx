import { FilePreviewModal } from '@/components/modals/file-preview-modal'
import { ImagePreviewModal } from '@/components/modals/image-preview-modal'
import { DownloadBlobLink } from '@/components/download-blob-link'
import { useEncryptedFilesPanel, type UnifiedFileRow } from '@/hooks/use-encrypted-files-panel'
import { decodeFileContents, imageMimeType } from '@/lib/file-content-helpers'
import { formatBytes } from '@/lib/format'
import type { JobFile, JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'
import { PrivateKeyForm } from '@/components/private-key-form'
import { Button, Stack, Table } from '@mantine/core'
import { CheckCircleIcon, LockIcon, LockOpenIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'

type EncryptedFilesPanelProps = {
    job: LatestJobForStudy
    onFilesApproved: (files: JobFileInfo[]) => void
    hideTableUntilDecrypted?: boolean
    isReviewer: boolean
}

export const EncryptedFilesPanel: FC<EncryptedFilesPanelProps> = ({
    job,
    onFilesApproved,
    hideTableUntilDecrypted = false,
    isReviewer,
}) => {
    const {
        fileRows,
        hasFileRows,
        isLoadingBlob,
        shouldShowForm,
        isDecrypting,
        form,
        handleSubmit,
        viewingFile,
        openFileViewer,
        closeFileViewer,
    } = useEncryptedFilesPanel({ job, onFilesApproved, isReviewer })

    // No decryptable rows for this user (a researcher with no wrapped keys yet — late joiner, or
    // pre-renewal). Render nothing rather than a form to nowhere. Future: an honest "no results
    // shared with you yet" empty state + the renewal re-wrap request affordance lives here.
    if (!hasFileRows) {
        return null
    }

    const showTable = !hideTableUntilDecrypted || !shouldShowForm

    return (
        <Stack>
            {showTable && <UnifiedFileTable rows={fileRows} onView={openFileViewer} />}
            <PrivateKeyForm
                isVisible={shouldShowForm}
                form={form}
                onSubmit={handleSubmit}
                isDecrypting={isDecrypting}
                isDisabled={isLoadingBlob}
                submitLabel="Decrypt Files"
            />
            <DecryptedFilePreview file={viewingFile} onClose={closeFileViewer} />
        </Stack>
    )
}

type UnifiedFileTableProps = {
    rows: UnifiedFileRow[]
    onView: (file: JobFile) => void
}

const UnifiedFileTable: FC<UnifiedFileTableProps> = ({ rows, onView }) => (
    <Table>
        <Table.Thead>
            <Table.Tr>
                <Table.Th w={40} />
                <Table.Th>File Type</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Size</Table.Th>
                <Table.Th>View</Table.Th>
                <Table.Th>Download</Table.Th>
            </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
            {rows.map((row) => (
                <UnifiedFileRow key={row.key} row={row} onView={onView} />
            ))}
        </Table.Tbody>
    </Table>
)

type UnifiedFileRowProps = {
    row: UnifiedFileRow
    onView: (file: JobFile) => void
}

const UnifiedFileRow: FC<UnifiedFileRowProps> = ({ row, onView }) => {
    const statusCell = {
        locked: <LockIcon size={18} color="var(--mantine-color-gray-5)" aria-label="Encrypted" />,
        decrypted: <LockOpenIcon size={18} color="var(--mantine-color-blue-6)" aria-label="Decrypted" />,
        approved: (
            <CheckCircleIcon
                size={18}
                weight="fill"
                color="var(--mantine-color-green-6)"
                aria-label="Shared with researcher"
            />
        ),
    }[row.state]

    const hasContents = row.file !== null

    return (
        <Table.Tr>
            <Table.Td>{statusCell}</Table.Td>
            <Table.Td>{row.label}</Table.Td>
            <Table.Td>{row.name}</Table.Td>
            <Table.Td>{row.bytes !== null && formatBytes(row.bytes)}</Table.Td>
            <Table.Td>
                {hasContents && (
                    <Button variant="light" size="xs" onClick={() => onView(row.file!)}>
                        View
                    </Button>
                )}
            </Table.Td>
            <Table.Td>
                {hasContents && <DownloadBlobLink filename={row.file!.path} fileContent={row.file!.contents} />}
            </Table.Td>
        </Table.Tr>
    )
}

const DecryptedFilePreview: FC<{ file: JobFile | null; onClose: () => void }> = ({ file, onClose }) => {
    if (!file) return null

    const mime = imageMimeType(file.path)
    if (mime) {
        return <ImagePreviewModal isVisible name={file.path} contents={file.contents} mime={mime} onClose={onClose} />
    }

    const previewFile = { name: file.path, contents: decodeFileContents(file.contents) }
    return <FilePreviewModal file={previewFile} onClose={onClose} />
}
