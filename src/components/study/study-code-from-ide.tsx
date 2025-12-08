'use client'

import { useQuery } from '@/common'
import { OpenWorkspaceButton } from '@/components/study/open-workspace-button'
import { listWorkspaceFilesAction } from '@/server/actions/workspace-files.actions'
import {
    ActionIcon,
    Button,
    Divider,
    Group,
    Paper,
    Radio,
    Table,
    Text,
    Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { DownloadSimpleIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { useEffect } from 'react'

interface StudyCodeFromIDEProps {
    studyId: string
    onMainFileChange?: (fileName: string) => void
    onFilesChange?: (files: string[]) => void
}

interface FormValues {
    mainFile: string
    files: string[]
}

export const StudyCodeFromIDE = ({ studyId, onMainFileChange, onFilesChange }: StudyCodeFromIDEProps) => {
    const form = useForm<FormValues>({
        initialValues: {
            mainFile: '',
            files: [],
        },
    })

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['workspace-files', studyId],
        queryFn: async () => {
            const result = await listWorkspaceFilesAction({ studyId })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
            return result
        },
    })

    useEffect(() => {
        if (data?.files && data.files.length > 0) {
            const mainFile = data.suggestedMain ?? data.files[0]
            form.setValues({ mainFile, files: data.files })
            onMainFileChange?.(mainFile)
            onFilesChange?.(data.files)
        }
    }, [data, form])

    const handleMainFileChange = (fileName: string) => {
        form.setFieldValue('mainFile', fileName)
        onMainFileChange?.(fileName)
    }

    const handleRemoveFile = (fileName: string) => {
        const newFiles = form.values.files.filter((f) => f !== fileName)
        form.setFieldValue('files', newFiles)
        onFilesChange?.(newFiles)

        if (form.values.mainFile === fileName) {
            const newMain = newFiles[0] ?? ''
            form.setFieldValue('mainFile', newMain)
            onMainFileChange?.(newMain)
        }
    }

    const handleImportFromIDE = () => {
        refetch()
        notifications.show({
            title: 'Files refreshed',
            message: 'File list has been updated from the IDE.',
            color: 'blue',
        })
    }

    return (
        <Paper p="xl">
            <Text fz="sm" fw={700} c="gray.6" pb="sm">
                Step 5 of 5
            </Text>
            <Title order={4}>Study code</Title>
            <Divider my="sm" mt="sm" mb="md" />

            <Group justify="space-between" align="flex-start" mb="md">
                <div>
                    <Text fw={600} mb="xs">Review files from IDE</Text>
                </div>
                <Group>
                    <OpenWorkspaceButton studyId={studyId} />
                    <Button
                        variant="filled"
                        leftSection={<DownloadSimpleIcon size={16} />}
                        onClick={handleImportFromIDE}
                        loading={isFetching}
                    >
                        Import files from IDE
                    </Button>
                </Group>
            </Group>

            <Radio.Group value={form.values.mainFile} onChange={handleMainFileChange}>
                <Table layout="fixed" verticalSpacing="md" highlightOnHover withTableBorder>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={100}>Main file</Table.Th>
                            <Table.Th>File name</Table.Th>
                            <Table.Th w={80}>Remove</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {form.values.files.length === 0 ? (
                            <Table.Tr>
                                <Table.Td colSpan={3}>
                                    <Text c="dimmed" ta="center" py="lg">
                                        {isLoading ? 'Loading files...' : 'No files found. Launch the IDE to add code files.'}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        ) : (
                            form.values.files.map((file) => (
                                <Table.Tr key={file}>
                                    <Table.Td>
                                        <Radio value={file} />
                                    </Table.Td>
                                    <Table.Td>
                                        {file}
                                    </Table.Td>
                                    <Table.Td>
                                        <ActionIcon
                                            variant="subtle"
                                            color="red"
                                            onClick={() => handleRemoveFile(file)}
                                        >
                                            <TrashIcon />
                                        </ActionIcon>
                                    </Table.Td>
                                </Table.Tr>
                            ))
                        )}
                    </Table.Tbody>
                </Table>
            </Radio.Group>
        </Paper>
    )
}
