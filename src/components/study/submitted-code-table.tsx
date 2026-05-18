'use client'

import { useState, type FC } from 'react'
import { ActionIcon, Divider, Group, Table, Text, Tooltip } from '@mantine/core'
import { EyeIcon, StarIcon } from '@phosphor-icons/react/dist/ssr'
import { useQuery } from '@/common'
import { fetchStudyJobCodeFileAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { FilePreviewModal } from './study-code-panel'

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

const SubmittedCodeRow: FC<{ file: SubmittedFile; onPreview: (file: SubmittedFile) => void }> = ({
    file,
    onPreview,
}) => {
    const isMain = file.fileType === 'MAIN-CODE'
    const starWeight = isMain ? 'fill' : 'regular'
    const starColor = isMain ? 'var(--mantine-color-indigo-6)' : 'var(--mantine-color-gray-5)'
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
                </Group>
            </Table.Td>
        </Table.Tr>
    )
}

export const SubmittedCodeTable: FC<SubmittedCodeTableProps> = ({ jobId, files }) => {
    const [previewFileName, setPreviewFileName] = useState<string | null>(null)

    const { data } = useQuery({
        queryKey: ['study-job-code-file', jobId, previewFileName],
        queryFn: () => fetchStudyJobCodeFileAction({ studyJobId: jobId, fileName: previewFileName as string }),
        enabled: !!previewFileName,
        staleTime: Infinity,
    })

    if (!files?.length) {
        return (
            <Text c="dimmed" size="sm">
                No code files were uploaded.
            </Text>
        )
    }

    const previewFile = previewFileName
        ? { name: previewFileName, contents: data?.fileName === previewFileName ? data.contents : null }
        : null

    const rowElements = files.map((file) => (
        <SubmittedCodeRow key={file.name} file={file} onPreview={(f) => setPreviewFileName(f.name)} />
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
            <FilePreviewModal file={previewFile} onClose={() => setPreviewFileName(null)} />
        </>
    )
}
