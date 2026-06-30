'use client'

import { ActionIcon, Divider, Group, Table, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { EyeIcon, InfoIcon, StarIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { InfoTooltip } from '@/components/tooltip'

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

interface MainFileStarProps {
    fileName: string
    isSelected: boolean
    onSelect: (fileName: string) => void
}

function MainFileStar({ fileName, isSelected, onSelect }: MainFileStarProps) {
    const label = isSelected ? `${fileName} is the main file` : `Set ${fileName} as main file`
    return (
        <Tooltip label={isSelected ? 'Main file' : 'Set as main file'}>
            <UnstyledButton
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => onSelect(fileName)}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
                <StarIcon
                    size={20}
                    weight={isSelected ? 'fill' : 'regular'}
                    color={isSelected ? 'var(--mantine-color-indigo-6)' : 'var(--mantine-color-gray-5)'}
                />
            </UnstyledButton>
        </Tooltip>
    )
}

const MAIN_FILE_TOOLTIP =
    "If you're creating or uploading multiple files, please select your main file (i.e., the script that runs first)"

function MainFileColumnHeader() {
    return (
        <Group gap={4} wrap="nowrap" align="center">
            <Text component="span" inherit>
                Main file
            </Text>
            <InfoTooltip label={MAIN_FILE_TOOLTIP} withArrow multiline w={280}>
                <Text component="span" display="inline-flex" aria-label="Main file info">
                    <InfoIcon size={14} weight="regular" aria-hidden />
                </Text>
            </InfoTooltip>
        </Group>
    )
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
            <Table highlightOnHover verticalSpacing="md">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th w={100}>
                            <MainFileColumnHeader />
                        </Table.Th>
                        <Table.Th>File name</Table.Th>
                        <Table.Th w={200}>Last updated</Table.Th>
                        <Table.Th w={80}>Actions</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {files.map((file) => (
                        <Table.Tr key={file.name}>
                            <Table.Td>
                                <MainFileStar
                                    fileName={file.name}
                                    isSelected={mainFile === file.name}
                                    onSelect={onMainFileChange}
                                />
                            </Table.Td>
                            <Table.Td>
                                <Tooltip label={file.name} disabled={file.name.length <= 48}>
                                    <Text truncate="end" maw={380}>
                                        {file.name}
                                    </Text>
                                </Tooltip>
                            </Table.Td>
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
            <Divider />
        </>
    )
}
