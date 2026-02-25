import { AppModal } from '@/components/modal'
import { useEncryptedFilesPanel, type UnifiedFileRow } from '@/hooks/use-encrypted-files-panel'
import { decodeFileContents, detectContentType, parseCsv } from '@/lib/file-content-helpers'
import { logLabel } from '@/lib/file-type-helpers'
import type { JobFile, JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Anchor, Button, Checkbox, Code, Group, ScrollArea, Stack, Table, Text, Textarea } from '@mantine/core'
import { CheckCircleIcon, DownloadSimpleIcon, InfoIcon, LockIcon } from '@phosphor-icons/react/dist/ssr'
import { InfoTooltip } from '@/components/tooltip'
import { FC, useEffect, useState } from 'react'

type EncryptedFilesPanelProps = {
    job: LatestJobForStudy
    onFilesApproved: (files: JobFileInfo[]) => void
}

export const EncryptedFilesPanel: FC<EncryptedFilesPanelProps> = ({ job, onFilesApproved }) => {
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

    return (
        <Stack>
            <UnifiedFileTable
                rows={fileRows}
                onView={openFileViewer}
                selectedPaths={selectedPaths}
                onToggle={toggleFile}
            />
            {shouldShowForm && (
                <form onSubmit={handleSubmit}>
                    <Stack>
                        <Textarea
                            label={<Text mb="sm">{`Enter Reviewer Key to view ${encryptedFileTypesLabel}`}</Text>}
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
            <FileViewerModal file={viewingFile} onClose={closeFileViewer} />
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
    }[row.state]

    const hasContents = row.file !== null

    return (
        <Table.Tr>
            <Table.Td>{statusCell}</Table.Td>
            <Table.Td>{row.label}</Table.Td>
            <Table.Td>{row.name}</Table.Td>
            <Table.Td>
                {hasContents && (
                    <Button variant="light" size="xs" onClick={() => onView(row.file!)}>
                        View
                    </Button>
                )}
            </Table.Td>
            <Table.Td>{hasContents && <FileDownloadLink file={row.file!} />}</Table.Td>
        </Table.Tr>
    )
}

const FileDownloadLink: FC<{ file: JobFile }> = ({ file }) => {
    const [href, setHref] = useState('#')

    useEffect(() => {
        const blob = new Blob([file.contents])
        const url = URL.createObjectURL(blob)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHref(url)
        return () => URL.revokeObjectURL(url)
    }, [file.contents])

    return (
        <Anchor
            href={href}
            download={file.path}
            data-testid="download-link"
            style={{ display: 'flex', alignItems: 'center' }}
        >
            Download <DownloadSimpleIcon size={16} style={{ marginLeft: 4 }} />
        </Anchor>
    )
}

const FileViewerModal: FC<{ file: JobFile | null; onClose: () => void }> = ({ file, onClose }) => {
    if (!file) return null

    const text = decodeFileContents(file.contents)
    const contentType = detectContentType(file.path)

    return (
        <AppModal isOpen onClose={onClose} title={`${logLabel(file.fileType)} - ${file.path}`} size="xl">
            {contentType === 'csv' ? <CsvViewer text={text} /> : <TextViewer text={text} />}
        </AppModal>
    )
}

const CsvViewer: FC<{ text: string }> = ({ text }) => {
    const { headers, rows } = parseCsv(text)

    if (headers.length === 0) {
        return <Text>Empty file</Text>
    }

    return (
        <ScrollArea h={500}>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        {headers.map((header, i) => (
                            <Table.Th key={i}>{header}</Table.Th>
                        ))}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {rows.map((row, i) => (
                        <Table.Tr key={i}>
                            {row.map((cell, j) => (
                                <Table.Td key={j}>{cell}</Table.Td>
                            ))}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </ScrollArea>
    )
}

const TextViewer: FC<{ text: string }> = ({ text }) => (
    <ScrollArea h={500}>
        <Code block>{text}</Code>
    </ScrollArea>
)
