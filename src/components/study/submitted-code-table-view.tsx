import { type FC } from 'react'
import { ActionIcon, Divider, Group, Table, Text, Tooltip } from '@mantine/core'
import { DownloadSimpleIcon, EyeIcon, StarIcon } from '@phosphor-icons/react/dist/ssr'
import type { LatestJobForStudy } from '@/server/db/queries'
import { studyCodeURL } from '@/lib/paths'

// Presentational table, deliberately free of data fetching (useQuery), server-action
// imports, and the preview modal so it can render in isolation (e.g. Ladle). The
// SubmittedCodeTable container (./submitted-code-table) owns that plumbing.

export type SubmittedFile = LatestJobForStudy['files'][number]

const formatUpdatedAt = (date: Date | string) =>
    new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })

const SubmittedCodeRow: FC<{
    file: SubmittedFile
    jobId: string
    onPreview: (file: SubmittedFile) => void
}> = ({ file, jobId, onPreview }) => {
    const isMain = file.fileType === 'MAIN-CODE'
    const starWeight = isMain ? 'fill' : 'regular'
    // Post-submission the main file is locked in, so the star renders in the disabled
    // grey style (still filled to show it's selected) rather than the active indigo used
    // while the researcher is choosing their main file.
    const starColor = 'var(--mantine-color-gray-5)'
    const starLabel = isMain ? 'Main file' : 'Supplemental file'
    const tooltipDisabled = file.name.length <= 48
    const lastUpdated = formatUpdatedAt(file.createdAt)

    return (
        <Table.Tr>
            <Table.Td>
                <StarIcon size={20} weight={starWeight} color={starColor} aria-label={starLabel} />
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
                        color="gray"
                        aria-label={`View ${file.name}`}
                    >
                        <EyeIcon weight="fill" />
                    </ActionIcon>
                    <ActionIcon
                        component="a"
                        href={studyCodeURL(jobId, file.name)}
                        download={file.name}
                        variant="subtle"
                        color="gray"
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
}

export const SubmittedCodeTableView: FC<SubmittedCodeTableViewProps> = ({ jobId, files, onPreview }) => {
    if (!files?.length) {
        return (
            <Text c="dimmed" size="sm">
                No code files were uploaded.
            </Text>
        )
    }

    const rowElements = files.map((file) => (
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
        </>
    )
}
