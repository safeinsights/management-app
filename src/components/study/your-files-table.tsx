'use client'

import { useState, type FC } from 'react'
import { ActionIcon, Group, HoverCard, Table, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { DownloadSimpleIcon, InfoIcon, PencilSimpleIcon, StarIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'

/** Ellipsis past this many characters; the full name goes in the hover tooltip. */
const FILE_NAME_MAX_CHARS = 50

const MAIN_FILE_HOVER_CARD =
    'It is the file that runs first in the secure enclave. It can call other files in your study. Select your main file before submitting.'

const NO_ACTIVITY = 'No activity yet'

const TOOLTIPS = {
    setMain: 'Set as main file',
    edit: 'Edit file in IDE',
    download: 'Download file',
    delete: 'Delete file',
    deleteMain: 'Main file cannot be deleted. Set another file as main first.',
} as const

const COLUMN_WIDTHS = {
    mainFile: 108,
    fileName: 220,
    lastActivity: 180,
    actions: 140,
} as const

const truncateFileName = (name: string) =>
    name.length > FILE_NAME_MAX_CHARS ? `${name.slice(0, FILE_NAME_MAX_CHARS)}…` : name

const MainFileColumnHeader: FC = () => (
    <Group gap={4} wrap="nowrap" align="center">
        <Text component="span" inherit>
            Main file
        </Text>
        <HoverCard width={280} withArrow shadow="md" position="top">
            <HoverCard.Target>
                <Text component="span" display="inline-flex" aria-label="Main file info">
                    <InfoIcon size={14} aria-hidden />
                </Text>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Text size="sm">{MAIN_FILE_HOVER_CARD}</Text>
            </HoverCard.Dropdown>
        </HoverCard>
    </Group>
)

type MainFileStarProps = {
    fileName: string
    isMain: boolean
    isEditable: boolean
    onSelect: (fileName: string) => void
}

const MainFileStar: FC<MainFileStarProps> = ({ fileName, isMain, isEditable, onSelect }) => (
    <Tooltip label={TOOLTIPS.setMain} withArrow>
        <UnstyledButton
            // A radio rather than a toggle: exactly one file is main, and unstarring the current
            // one is not a state the page has.
            role="radio"
            aria-checked={isMain}
            aria-label={isMain ? `${fileName} is the main file` : `Set ${fileName} as main file`}
            disabled={!isEditable}
            onClick={() => onSelect(fileName)}
            style={{ display: 'inline-flex', cursor: isEditable ? 'pointer' : 'not-allowed' }}
        >
            <StarIcon
                size={20}
                weight={isMain ? 'fill' : 'regular'}
                color={
                    isEditable
                        ? 'var(--mantine-color-blue-7)'
                        : /* greyed rather than hidden: view-only still shows which file is main */
                          'var(--mantine-color-charcoal-3)'
                }
            />
        </UnstyledButton>
    </Tooltip>
)

const FileNameCell: FC<{ fileName: string; onView: (fileName: string) => void }> = ({ fileName, onView }) => {
    const [isHovered, setIsHovered] = useState(false)

    return (
        <Tooltip label={fileName} withArrow disabled={fileName.length <= FILE_NAME_MAX_CHARS}>
            <UnstyledButton
                onClick={() => onView(fileName)}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                aria-label={`View ${fileName}`}
                style={{ cursor: 'pointer', textDecoration: isHovered ? 'underline' : 'none' }}
            >
                <Text component="span" inherit>
                    {truncateFileName(fileName)}
                </Text>
            </UnstyledButton>
        </Tooltip>
    )
}

type FileActionsProps = {
    fileName: string
    isMain: boolean
    isEditable: boolean
    onEdit: () => void
    onDownload: (fileName: string) => void
    onDelete: (fileName: string) => void
}

const FileActions: FC<FileActionsProps> = ({ fileName, isMain, isEditable, onEdit, onDownload, onDelete }) => (
    <Group gap="xs" justify="center" wrap="nowrap">
        <Tooltip label={TOOLTIPS.edit} withArrow>
            <ActionIcon
                variant="subtle"
                color="gray"
                disabled={!isEditable}
                aria-label={`Edit ${fileName} in IDE`}
                onClick={onEdit}
            >
                <PencilSimpleIcon />
            </ActionIcon>
        </Tooltip>
        <Tooltip label={TOOLTIPS.download} withArrow>
            <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={`Download ${fileName}`}
                onClick={() => onDownload(fileName)}
            >
                <DownloadSimpleIcon />
            </ActionIcon>
        </Tooltip>
        {/* Wrapped so the tooltip still fires while the control is disabled, which is the whole
            point of the main-file case. */}
        <Tooltip label={isMain ? TOOLTIPS.deleteMain : TOOLTIPS.delete} withArrow multiline w={240}>
            <ActionIcon
                variant="subtle"
                color="gray"
                disabled={isMain || !isEditable}
                aria-label={`Delete ${fileName}`}
                onClick={() => onDelete(fileName)}
            >
                <TrashIcon />
            </ActionIcon>
        </Tooltip>
    </Group>
)

type FileRowProps = {
    file: WorkspaceFileInfo
    isMain: boolean
    isEditable: boolean
    onSelectMain: (fileName: string) => void
    onView: (fileName: string) => void
    onEdit: () => void
    onDownload: (fileName: string) => void
    onDelete: (fileName: string) => void
}

const FileRow: FC<FileRowProps> = ({
    file,
    isMain,
    isEditable,
    onSelectMain,
    onView,
    onEdit,
    onDownload,
    onDelete,
}) => (
    <Table.Tr>
        <Table.Td>
            <MainFileStar fileName={file.name} isMain={isMain} isEditable={isEditable} onSelect={onSelectMain} />
        </Table.Td>
        <Table.Td>
            <FileNameCell fileName={file.name} onView={onView} />
        </Table.Td>
        <Table.Td>
            {/* OTTER-693 leaves this at the default: naming the researcher and the action needs
                per-file provenance the workspace listing does not carry yet. */}
            <Text size="sm" c="charcoal.7">
                {NO_ACTIVITY}
            </Text>
        </Table.Td>
        <Table.Td>
            <FileActions
                fileName={file.name}
                isMain={isMain}
                isEditable={isEditable}
                onEdit={onEdit}
                onDownload={onDownload}
                onDelete={onDelete}
            />
        </Table.Td>
    </Table.Tr>
)

type YourFilesTableProps = {
    files: WorkspaceFileInfo[]
    mainFile: string
    isEditable?: boolean
    onSelectMain: (fileName: string) => void
    onView: (fileName: string) => void
    onEdit: () => void
    onDownload: (fileName: string) => void
    onDelete: (fileName: string) => void
}

export const YourFilesTable: FC<YourFilesTableProps> = ({
    files,
    mainFile,
    isEditable = true,
    onSelectMain,
    onView,
    onEdit,
    onDownload,
    onDelete,
}) => {
    const [pendingDelete, setPendingDelete] = useState<string | null>(null)

    const confirmDelete = () => {
        if (pendingDelete) onDelete(pendingDelete)
        setPendingDelete(null)
    }

    return (
        <>
            <Table verticalSpacing="md" layout="fixed" w="100%">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th w={COLUMN_WIDTHS.mainFile}>
                            <MainFileColumnHeader />
                        </Table.Th>
                        <Table.Th miw={COLUMN_WIDTHS.fileName}>File name</Table.Th>
                        <Table.Th miw={COLUMN_WIDTHS.lastActivity}>Last activity</Table.Th>
                        <Table.Th w={COLUMN_WIDTHS.actions}>Actions</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody role="radiogroup" aria-label="Main file">
                    {files.map((file) => (
                        <FileRow
                            key={file.name}
                            file={file}
                            isMain={file.name === mainFile}
                            isEditable={isEditable}
                            onSelectMain={onSelectMain}
                            onView={onView}
                            onEdit={onEdit}
                            onDownload={onDownload}
                            onDelete={setPendingDelete}
                        />
                    ))}
                </Table.Tbody>
            </Table>

            <SubmitConfirmationModal
                isOpen={pendingDelete !== null}
                onClose={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
                isSubmitting={false}
                title="Delete file"
                body={`${pendingDelete ?? ''} will be permanently removed from your study and cannot be recovered.`}
                confirmLabel="Delete file"
            />
        </>
    )
}
