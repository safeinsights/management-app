'use client'

import type { FC } from 'react'
import { ActionIcon, Divider, Group, Table, Text, Tooltip } from '@mantine/core'
import { EyeIcon, StarIcon } from '@phosphor-icons/react/dist/ssr'
import { studyCodeURL } from '@/lib/paths'
import type { LatestJobForStudy } from '@/server/db/queries'

type SubmittedFile = LatestJobForStudy['files'][number]

interface SubmittedCodeTableProps {
    jobId: string
    files: LatestJobForStudy['files']
}

const formatUpdatedAt = (date: Date | string) =>
    new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })

const SubmittedCodeRow: FC<{ jobId: string; file: SubmittedFile }> = ({ jobId, file }) => {
    const isMain = file.fileType === 'MAIN-CODE'
    const starWeight = isMain ? 'fill' : 'regular'
    const starColor = isMain ? 'var(--mantine-color-indigo-6)' : 'var(--mantine-color-gray-5)'
    const starLabel = isMain ? 'Main file' : 'Supplemental file'
    const tooltipDisabled = file.name.length <= 48
    const fileHref = studyCodeURL(jobId, file.name)
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
                        component="a"
                        href={fileHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="subtle"
                        color="gray"
                        aria-label={`View ${file.name}`}
                    >
                        <EyeIcon weight="fill" />
                    </ActionIcon>
                </Group>
            </Table.Td>
        </Table.Tr>
    )
}

export const SubmittedCodeTable: FC<SubmittedCodeTableProps> = ({ jobId, files }) => {
    if (!files?.length) {
        return (
            <Text c="dimmed" size="sm">
                No code files were uploaded.
            </Text>
        )
    }

    const rowElements = files.map((file) => <SubmittedCodeRow key={file.name} jobId={jobId} file={file} />)

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
