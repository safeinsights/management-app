'use client'

import { ActionIcon, Radio, Table, Text } from '@mantine/core'
import { TrashIcon } from '@phosphor-icons/react/dist/ssr'

interface FileReviewTableProps {
    files: string[]
    mainFile: string
    onMainFileChange: (file: string) => void
    onRemoveFile: (file: string) => void
    lastModified?: string | null
}

export const FileReviewTable = ({
    files,
    mainFile,
    onMainFileChange,
    onRemoveFile,
    lastModified,
}: FileReviewTableProps) => {
    return (
        <>
            {lastModified && (
                <Text fz="sm" c="dimmed" mb="sm">
                    Last updated on{' '}
                    {new Date(lastModified).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                    })}
                </Text>
            )}
            <Radio.Group value={mainFile} onChange={onMainFileChange}>
                <Table layout="fixed" verticalSpacing="md" highlightOnHover withTableBorder>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={100}>Main file</Table.Th>
                            <Table.Th>File name</Table.Th>
                            <Table.Th w={80}>Remove</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {files.map((file) => (
                            <Table.Tr key={file}>
                                <Table.Td>
                                    <Radio value={file} />
                                </Table.Td>
                                <Table.Td>{file}</Table.Td>
                                <Table.Td>
                                    <ActionIcon variant="subtle" color="red" onClick={() => onRemoveFile(file)}>
                                        <TrashIcon />
                                    </ActionIcon>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Radio.Group>
        </>
    )
}
