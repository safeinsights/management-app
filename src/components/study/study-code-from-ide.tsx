'use client'

import { useQuery } from '@/common'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import { useWorkspaceLauncher } from '@/hooks/use-workspace-launcher'
import { listWorkspaceFilesAction } from '@/server/actions/workspace-files.actions'
import { ActionIcon, Box, Button, Divider, Group, Paper, Radio, Stack, Table, Text, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { ArrowSquareOutIcon, DownloadSimpleIcon, TrashIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { useEffect, useState } from 'react'
import { CompactStatusButton } from './compact-status-button'

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
    const [hasImported, setHasImported] = useState(false)
    const {
        launchWorkspace,
        isLoading: isLaunchingWorkspace,
        isPending: isWorkspacePending,
        error: launchError,
    } = useWorkspaceLauncher({ studyId })

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
        enabled: hasImported, // Only fetch when user explicitly imports
    })

    useEffect(() => {
        if (data?.files && data.files.length > 0) {
            const mainFile = data.suggestedMain ?? data.files[0]
            form.setValues({ mainFile, files: data.files })
            onMainFileChange?.(mainFile)
            onFilesChange?.(data.files)
        }
    }, [data, form, onMainFileChange, onFilesChange])

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
        setHasImported(true)
        refetch()
        notifications.show({
            title: 'Files imported',
            message: 'File list has been updated from the IDE.',
            color: 'blue',
        })
    }

    const isIDELoading = isLaunchingWorkspace || isWorkspacePending
    const showEmptyState = !hasImported || (hasImported && form.values.files.length === 0 && !isLoading)
    const { messageWithEllipsis } = useLoadingMessages(isIDELoading)

    const renderLaunchButton = () => {
        if (launchError) {
            return (
                <CompactStatusButton
                    icon={<WarningCircleIcon size={14} weight="fill" />}
                    primaryText="Launch failed"
                    secondaryText="Please try again later"
                    color="red"
                    onClick={launchWorkspace}
                />
            )
        }

        if (isIDELoading) {
            return <CompactStatusButton primaryText="Launching IDE" secondaryText={messageWithEllipsis} loading />
        }

        return (
            <Button variant="outline" rightSection={<ArrowSquareOutIcon size={16} />} onClick={launchWorkspace}>
                Launch IDE
            </Button>
        )
    }

    return (
        <Paper p="xl">
            <Text fz="sm" fw={700} c="gray.6" pb="sm">
                STEP 4 OF 4
            </Text>
            <Title order={4}>Study code</Title>
            <Divider my="sm" mt="sm" mb="md" />

            <Group justify="space-between" align="center" mb="md">
                <Text fw={600}>Review files from IDE</Text>
                <Group>
                    {renderLaunchButton()}
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

            {showEmptyState ? (
                <Box bg="gray.1" py={60} style={{ borderRadius: 8 }}>
                    <Stack align="center" gap="md">
                        <Text c="dimmed">
                            {isLoading ? 'Loading files...' : 'You have not imported any files yet.'}
                        </Text>
                        {!isLoading && (
                            <Button
                                variant="transparent"
                                leftSection={<DownloadSimpleIcon size={16} />}
                                onClick={handleImportFromIDE}
                                loading={isFetching}
                            >
                                Import files from IDE
                            </Button>
                        )}
                    </Stack>
                </Box>
            ) : (
                <>
                    {data?.lastModified && (
                        <Text fz="sm" c="dimmed" mb="sm">
                            Last updated on{' '}
                            {new Date(data.lastModified).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                            })}
                        </Text>
                    )}
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
                                {form.values.files.map((file) => (
                                    <Table.Tr key={file}>
                                        <Table.Td>
                                            <Radio value={file} />
                                        </Table.Td>
                                        <Table.Td>{file}</Table.Td>
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
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Radio.Group>
                </>
            )}
        </Paper>
    )
}
