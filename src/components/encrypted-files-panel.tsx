import { FilePreviewModal } from '@/components/modals/file-preview-modal'
import { InfoTooltip } from '@/components/tooltip'
import { DownloadBlobLink } from '@/components/download-blob-link'
import { useEncryptedFilesPanel, type UnifiedFileRow } from '@/hooks/use-encrypted-files-panel'
import { decodeFileContents } from '@/lib/file-content-helpers'
import { formatBytes } from '@/lib/format'
import type { JobFile, JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Button, Checkbox, Group, Stack, Table, Text, Textarea } from '@mantine/core'
import { CheckCircleIcon, InfoIcon, LockIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'

type EncryptedFilesPanelProps = {
    job: LatestJobForStudy
    onFilesApproved: (files: JobFileInfo[]) => void
    hideKeyLabel?: boolean
    hideTableUntilDecrypted?: boolean
}

export const EncryptedFilesPanel: FC<EncryptedFilesPanelProps> = ({
    job,
    onFilesApproved,
    hideKeyLabel = false,
    hideTableUntilDecrypted = false,
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
        encryptedFileTypesLabel,
        selectedPaths,
        toggleFile,
    } = useEncryptedFilesPanel({ job, onFilesApproved })

    if (!hasFileRows) {
        return null
    }

    const showTable = !hideTableUntilDecrypted || !shouldShowForm

    return (
        <Stack>
            {showTable && (
                <UnifiedFileTable
                    rows={fileRows}
                    onView={openFileViewer}
                    selectedPaths={selectedPaths}
                    onToggle={toggleFile}
                />
            )}
            {shouldShowForm && (
                <form onSubmit={handleSubmit}>
                    <Stack>
                        <Textarea
                            label={
                                hideKeyLabel ? undefined : (
                                    <Text mb="sm">{`Enter Reviewer key to view ${encryptedFileTypesLabel}`}</Text>
                                )
                            }
                            resize="vertical"
                            {...form.getInputProps('privateKey')}
                            placeholder="Enter your Reviewer key to access encrypted content."
                            key={form.key('privateKey')}
                        />
                        <Group>
                            <Button type="submit" disabled={!form.isValid() || isLoadingBlob} loading={isDecrypting}>
                                Decrypt Files
                            </Button>
                        </Group>
                    </Stack>
                </form>
            )}
            <DecryptedFilePreview file={viewingFile} onClose={closeFileViewer} />
        </Stack>
    )
}

type UnifiedFileTableProps = {
    rows: UnifiedFileRow[]
    onView: (file: JobFile) => void
    selectedPaths: Set<string>
    onToggle: (path: string) => void
}

const UnifiedFileTable: FC<UnifiedFileTableProps> = ({ rows, onView, selectedPaths, onToggle }) => (
    <Table>
        <Table.Thead>
            <Table.Tr>
                <Table.Th w={40}>
                    <InfoTooltip label="Selected files will be shared with the researcher" withArrow multiline w={200}>
                        <InfoIcon size={16} color="var(--mantine-color-blue-6)" />
                    </InfoTooltip>
                </Table.Th>
                <Table.Th>File Type</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Size</Table.Th>
                <Table.Th>View</Table.Th>
                <Table.Th>Download</Table.Th>
            </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
            {rows.map((row) => (
                <UnifiedFileRow
                    key={row.key}
                    row={row}
                    onView={onView}
                    isSelected={selectedPaths.has(row.name)}
                    onToggle={onToggle}
                />
            ))}
        </Table.Tbody>
    </Table>
)

type UnifiedFileRowProps = {
    row: UnifiedFileRow
    onView: (file: JobFile) => void
    isSelected: boolean
    onToggle: (path: string) => void
}

const UnifiedFileRow: FC<UnifiedFileRowProps> = ({ row, onView, isSelected, onToggle }) => {
    const statusCell = {
        locked: <LockIcon size={18} color="var(--mantine-color-gray-5)" />,
        approved: <CheckCircleIcon size={18} weight="fill" color="var(--mantine-color-green-6)" />,
        decrypted: (
            <Checkbox checked={isSelected} onChange={() => onToggle(row.name)} aria-label={`Select ${row.label}`} />
        ),
        'not-shared': (
            <InfoTooltip label="Not shared with researcher" withArrow>
                <XCircleIcon
                    size={18}
                    weight="fill"
                    color="var(--mantine-color-red-6)"
                    aria-label={`${row.name} not shared with researcher`}
                />
            </InfoTooltip>
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
    const previewFile = { name: file.path, contents: decodeFileContents(file.contents) }
    return <FilePreviewModal file={previewFile} onClose={onClose} />
}
