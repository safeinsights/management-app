import { type FC } from 'react'
import { ActionIcon, Anchor, Divider, Group, Table, Text, Tooltip } from '@mantine/core'
import { DownloadSimpleIcon, PencilSimpleIcon, StarIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { WorkspaceFileActivitySummary } from '@/hooks/use-workspace-files'
import { studyCodeURL } from '@/lib/paths'
import { semanticColor } from '@/theme/tokens'
import { CollapseToggleLink } from './collapse-toggle-link'
import { LastActivityCell, MAIN_FILE_COLUMN_WIDTH, MainFileColumnHeader } from './code-files-table-parts'

// Free of data fetching and the preview modal so it can render in isolation.

export type SubmittedFile = LatestJobForStudy['files'][number]

export type FileActivityByName = Record<string, WorkspaceFileActivitySummary>

// Post-submission the main file is locked in, so the star renders grey but still filled.
const STAR_COLOR = 'var(--mantine-color-gray-5)'

const FileNameButton: FC<{ file: SubmittedFile; onPreview: (file: SubmittedFile) => void }> = ({ file, onPreview }) => (
    <Tooltip label={file.name} disabled={file.name.length <= 48}>
        <Anchor
            component="button"
            type="button"
            underline="hover"
            c={semanticColor('text.primary')}
            maw="100%"
            onClick={() => onPreview(file)}
            aria-label={`View ${file.name}`}
        >
            <Text truncate="end" inherit>
                {file.name}
            </Text>
        </Anchor>
    </Tooltip>
)

// Edit and delete stay visible but dead so the columns line up with the Edit code table.
const SubmittedFileActions: FC<{ fileName: string; jobId: string }> = ({ fileName, jobId }) => (
    <Group gap="xs" justify="center" wrap="nowrap">
        <ActionIcon variant="transparent" color="grey" disabled aria-label={`Edit ${fileName} in IDE`}>
            <PencilSimpleIcon size={20} weight="bold" />
        </ActionIcon>
        <ActionIcon
            component="a"
            href={studyCodeURL(jobId, fileName)}
            download={fileName}
            variant="transparent"
            color="grey"
            aria-label={`Download ${fileName}`}
        >
            <DownloadSimpleIcon size={20} weight="bold" color={semanticColor('icon.light')} />
        </ActionIcon>
        <ActionIcon variant="transparent" color="grey" disabled aria-label={`Delete ${fileName}`}>
            <TrashIcon size={20} weight="fill" />
        </ActionIcon>
    </Group>
)

const SubmittedCodeRow: FC<{
    file: SubmittedFile
    jobId: string
    activity: WorkspaceFileActivitySummary | undefined
    onPreview: (file: SubmittedFile) => void
}> = ({ file, jobId, activity, onPreview }) => {
    const isMain = file.fileType === 'MAIN-CODE'

    return (
        <Table.Tr>
            <Table.Td ta="center">
                <StarIcon
                    size={20}
                    weight={isMain ? 'fill' : 'regular'}
                    color={STAR_COLOR}
                    aria-label={isMain ? 'Main file' : 'Supplemental file'}
                />
            </Table.Td>
            <Table.Td>
                <FileNameButton file={file} onPreview={onPreview} />
            </Table.Td>
            <Table.Td>
                <LastActivityCell activity={activity} />
            </Table.Td>
            <Table.Td>
                <SubmittedFileActions fileName={file.name} jobId={jobId} />
            </Table.Td>
        </Table.Tr>
    )
}

export interface SubmittedCodeTableViewProps {
    jobId: string
    files: LatestJobForStudy['files']
    activityByName?: FileActivityByName
    onPreview: (file: SubmittedFile) => void
    maxVisibleFiles?: number
    expanded?: boolean
    onToggleExpand?: () => void
}

export const SubmittedCodeTableView: FC<SubmittedCodeTableViewProps> = ({
    jobId,
    files,
    activityByName = {},
    onPreview,
    maxVisibleFiles,
    expanded = false,
    onToggleExpand,
}) => {
    if (!files?.length) {
        return (
            <Text c="dimmed" size="sm">
                No code files were uploaded.
            </Text>
        )
    }

    const isTruncated = maxVisibleFiles != null && files.length > maxVisibleFiles
    const visibleFiles = isTruncated && !expanded ? files.slice(0, maxVisibleFiles) : files

    const rowElements = visibleFiles.map((file) => (
        <SubmittedCodeRow
            key={file.name}
            file={file}
            jobId={jobId}
            activity={activityByName[file.name]}
            onPreview={onPreview}
        />
    ))

    return (
        <>
            <Table verticalSpacing="md" layout="fixed" w="100%" data-testid="submitted-code-table">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th w={MAIN_FILE_COLUMN_WIDTH}>
                            <MainFileColumnHeader />
                        </Table.Th>
                        <Table.Th>File name</Table.Th>
                        <Table.Th>Last activity</Table.Th>
                        <Table.Th w={140}>Actions</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{rowElements}</Table.Tbody>
            </Table>
            <Divider />
            <ViewAllToggle isVisible={isTruncated} expanded={expanded} onClick={onToggleExpand} />
        </>
    )
}

const ViewAllToggle: FC<{ isVisible: boolean; expanded: boolean; onClick?: () => void }> = ({
    isVisible,
    expanded,
    onClick,
}) => {
    if (!onClick) return null

    return (
        <CollapseToggleLink
            label={expanded ? 'Hide code files' : 'View all code files'}
            isExpanded={expanded}
            onClick={onClick}
            isVisible={isVisible}
            mt="xs"
            testId="view-all-code-files-toggle"
        />
    )
}
