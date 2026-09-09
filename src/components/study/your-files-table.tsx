'use client'

import { useState, type FC } from 'react'
import { ActionIcon, Badge, Group, HoverCard, Table, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { DownloadSimpleIcon, InfoIcon, PencilSimpleIcon, StarIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import type { WorkspaceFileActivitySummary, WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { MainFileTemplateCopy } from './main-file-template-copy'

/** Ellipsis past this many characters; the full name goes in the hover tooltip. */
const FILE_NAME_MAX_CHARS = 50

const MAIN_FILE_HOVER_CARD =
    'It is the file that runs first in the secure enclave. It can call other files in your study. Select your main file before submitting.'

const NO_ACTIVITY = 'No activity yet'

const ACTION_LABELS: Record<WorkspaceFileActivitySummary['action'], string> = {
    UPLOADED: 'Uploaded',
    EDITED_IN_IDE: 'Edited in IDE',
}

/** `{researcherName} · {action} · {MMM DD, YYYY}, {hh:mm am/pm}` per the card. */
const formatActivity = (activity: WorkspaceFileActivitySummary) =>
    [
        activity.actorName,
        ACTION_LABELS[activity.action],
        dayjs(activity.createdAt).format('MMM DD, YYYY, hh:mm a'),
    ].join(' · ')

const LastActivityCell: FC<{ activity: WorkspaceFileActivitySummary | null | undefined }> = ({ activity }) => (
    <Text size="sm" c="charcoal.7">
        {activity ? formatActivity(activity) : NO_ACTIVITY}
    </Text>
)

const TOOLTIPS = {
    setMain: 'Set as main file',
    edit: 'Edit file in IDE',
    download: 'Download file',
    delete: 'Delete file',
    deleteMain: 'Main file cannot be deleted. Set another file as main first.',
} as const

const editLockedTooltip = (ideOwnerName: string | null) =>
    `Only ${ideOwnerName ?? 'the assigned researcher'} can edit this study files in the IDE`

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

/**
 * Marks the Data Partner's starter file. Shown only while the template is untouched — the hook
 * drops a file from templateFileNames once it has been edited or replaced.
 */
const TemplateBadge: FC<{ isVisible: boolean; dataPartnerName: string }> = ({ isVisible, dataPartnerName }) => {
    if (!isVisible) return null

    return (
        <HoverCard width={340} withArrow shadow="md" position="bottom-start">
            <HoverCard.Target>
                <Badge variant="light" color="gray" tt="none" style={{ cursor: 'default' }}>
                    Template
                </Badge>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Text size="sm">
                    <MainFileTemplateCopy dataPartnerName={dataPartnerName} />
                </Text>
            </HoverCard.Dropdown>
        </HoverCard>
    )
}

type FileNameCellProps = {
    fileName: string
    isTemplate: boolean
    dataPartnerName: string
    onView: (fileName: string) => void
}

const FileNameCell: FC<FileNameCellProps> = ({ fileName, isTemplate, dataPartnerName, onView }) => {
    const [isHovered, setIsHovered] = useState(false)

    return (
        <Group gap="xs" wrap="nowrap">
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
            <TemplateBadge isVisible={isTemplate} dataPartnerName={dataPartnerName} />
        </Group>
    )
}

type FileActionsProps = {
    fileName: string
    isMain: boolean
    isEditable: boolean
    canEditInIde: boolean
    ideOwnerName: string | null
    onEdit: (fileName: string) => void
    onDownload: (fileName: string) => void
    onDelete: (fileName: string) => void
}

const FileActions: FC<FileActionsProps> = ({
    fileName,
    isMain,
    isEditable,
    canEditInIde,
    ideOwnerName,
    onEdit,
    onDownload,
    onDelete,
}) => (
    <Group gap="xs" justify="center" wrap="nowrap">
        {/* Two reasons the pencil goes dead, and they need different tooltips: the page is
            view-only, or another researcher holds the IDE. */}
        <Tooltip label={canEditInIde ? TOOLTIPS.edit : editLockedTooltip(ideOwnerName)} withArrow multiline w={240}>
            <ActionIcon
                variant="subtle"
                color="gray"
                disabled={!isEditable || !canEditInIde}
                aria-label={`Edit ${fileName} in IDE`}
                onClick={() => onEdit(fileName)}
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
    isTemplate: boolean
    dataPartnerName: string
    isEditable: boolean
    canEditInIde: boolean
    ideOwnerName: string | null
    onSelectMain: (fileName: string) => void
    onView: (fileName: string) => void
    onEdit: (fileName: string) => void
    onDownload: (fileName: string) => void
    onDelete: (fileName: string) => void
}

const FileRow: FC<FileRowProps> = ({
    file,
    isMain,
    isTemplate,
    dataPartnerName,
    isEditable,
    canEditInIde,
    ideOwnerName,
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
            <FileNameCell
                fileName={file.name}
                isTemplate={isTemplate}
                dataPartnerName={dataPartnerName}
                onView={onView}
            />
        </Table.Td>
        <Table.Td>
            <LastActivityCell activity={file.lastActivity} />
        </Table.Td>
        <Table.Td>
            <FileActions
                fileName={file.name}
                isMain={isMain}
                isEditable={isEditable}
                canEditInIde={canEditInIde}
                ideOwnerName={ideOwnerName}
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
    templateFileNames?: string[]
    dataPartnerName: string
    isEditable?: boolean
    canEditInIde?: boolean
    ideOwnerName?: string | null
    onSelectMain: (fileName: string) => void
    onView: (fileName: string) => void
    onEdit: (fileName: string) => void
    onDownload: (fileName: string) => void
    onDelete: (fileName: string) => void
}

export const YourFilesTable: FC<YourFilesTableProps> = ({
    files,
    mainFile,
    templateFileNames = [],
    dataPartnerName,
    isEditable = true,
    canEditInIde = true,
    ideOwnerName = null,
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
                            isTemplate={templateFileNames.includes(file.name)}
                            dataPartnerName={dataPartnerName}
                            isEditable={isEditable}
                            canEditInIde={canEditInIde}
                            ideOwnerName={ideOwnerName}
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
