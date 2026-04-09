'use client'

import { ActionIcon, Divider, Group, Radio, Table, Text } from '@mantine/core'
import { EyeIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'

interface FileReviewTableProps {
    files: WorkspaceFileInfo[]
    mainFile: string
    onMainFileChange: (file: string) => void
    onRemoveFile: (file: string) => void
    onViewFile: (file: string) => void
    jobCreatedAt: string | null
}

function formatModified(mtime: string, jobCreatedAt: string | null): string {
    if (!jobCreatedAt) return 'Never'
    if (new Date(mtime).getTime() <= new Date(jobCreatedAt).getTime()) return 'Never'
    return new Date(mtime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}

export const FileReviewTable = ({
    files,
    mainFile,
    onMainFileChange,
    onRemoveFile,
    onViewFile,
    jobCreatedAt,
}: FileReviewTableProps) => {
    return (
        <>
            <Radio.Group value={mainFile} onChange={onMainFileChange}>
                <Table highlightOnHover verticalSpacing="md">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={100}>Main file</Table.Th>
                            <Table.Th>File name</Table.Th>
                            <Table.Th w={140}>Last modified</Table.Th>
                            <Table.Th w={80}>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {files.map((file) => (
                            <Table.Tr key={file.name}>
                                <Table.Td>
                                    <Radio value={file.name} />
                                </Table.Td>
                                <Table.Td>{file.name}</Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        {formatModified(file.mtime, jobCreatedAt)}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs">
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            aria-label={`View ${file.name}`}
                                            onClick={() => onViewFile(file.name)}
                                        >
                                            <EyeIcon weight="fill" />
                                        </ActionIcon>
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            aria-label={`Remove ${file.name}`}
                                            onClick={() => onRemoveFile(file.name)}
                                        >
                                            <TrashIcon weight="fill" />
                                        </ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Radio.Group>
            <Divider />
        </>
    )
}
