import { type FC } from 'react'
import { ActionIcon, Divider, Group, Table, Text, Tooltip } from '@mantine/core'
import { DownloadSimpleIcon, EyeIcon, StarIcon } from '@phosphor-icons/react/dist/ssr'
import type { LatestJobForStudy } from '@/server/db/queries'
import { studyCodeURL } from '@/lib/paths'
import { CollapseToggleLink } from './collapse-toggle-link'

// Free of data fetching and the preview modal so it can render in isolation.

export type SubmittedFile = LatestJobForStudy['files'][number]

const formatUpdatedAt = (date: Date | string) =>
    new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })

// Post-submission the main file is locked in, so the star renders grey but still filled.
const STAR_COLOR = 'var(--mantine-color-gray-5)'

const SubmittedCodeRow: FC<{
    file: SubmittedFile
    jobId: string
    onPreview: (file: SubmittedFile) => void
}> = ({ file, jobId, onPreview }) => {
    const isMain = file.fileType === 'MAIN-CODE'
    const starWeight = isMain ? 'fill' : 'regular'
    const starLabel = isMain ? 'Main file' : 'Supplemental file'
    const tooltipDisabled = file.name.length <= 48
    const lastUpdated = formatUpdatedAt(file.createdAt)

    return (
        <Table.Tr>
            <Table.Td>
                <StarIcon size={20} weight={starWeight} color={STAR_COLOR} aria-label={starLabel} />
            </Table.Td>
            <Table.Td>
                <Tooltip label={file.name} disabled={tooltipDisabled}>
                    <Text truncate="end" maw={380}>
                        {file.name}
                    </Text>
                </Tooltip>
            </Table.Td>
            <Table.Td>
                <Text size="sm" c="dimmed">
                    {lastUpdated}
                </Text>
            </Table.Td>
            <Table.Td>
                <Group gap="xs">
                    <ActionIcon
                        onClick={() => onPreview(file)}
                        variant="subtle"
                        color="grey"
                        aria-label={`View ${file.name}`}
                    >
                        <EyeIcon weight="fill" />
                    </ActionIcon>
                    <ActionIcon
                        component="a"
                        href={studyCodeURL(jobId, file.name)}
                        download={file.name}
                        variant="subtle"
                        color="grey"
                        aria-label={`Download ${file.name}`}
                    >
                        <DownloadSimpleIcon weight="fill" />
                    </ActionIcon>
                </Group>
            </Table.Td>
        </Table.Tr>
    )
}

export interface SubmittedCodeTableViewProps {
    jobId: string
    files: LatestJobForStudy['files']
    onPreview: (file: SubmittedFile) => void
    /** When set, only this many rows render initially; the rest sit behind "View all code files". */
    maxVisibleFiles?: number
    expanded?: boolean
    onToggleExpand?: () => void
}

export const SubmittedCodeTableView: FC<SubmittedCodeTableViewProps> = ({
    jobId,
    files,
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
        <SubmittedCodeRow key={file.name} file={file} jobId={jobId} onPreview={onPreview} />
    ))

    return (
        <>
            <Table highlightOnHover verticalSpacing="md" data-testid="submitted-code-table">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th w={100}>Main file</Table.Th>
                        <Table.Th>File name</Table.Th>
                        <Table.Th w={200}>Last updated</Table.Th>
                        <Table.Th w={80}>Actions</Table.Th>
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
