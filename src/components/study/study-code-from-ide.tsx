'use client'

import { useIDEFiles } from '@/hooks/use-ide-files'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import { ActionIcon, Box, Button, Divider, Group, Paper, Radio, Stack, Table, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon, DownloadSimpleIcon, TrashIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { CompactStatusButton } from './compact-status-button'

interface StudyCodeFromIDEProps {
    studyId: string
    onChange?: (state: { files: string[]; mainFile: string }) => void
}

export const StudyCodeFromIDE = ({ studyId, onChange }: StudyCodeFromIDEProps) => {
    const ide = useIDEFiles({ studyId, onChange })
    const { messageWithEllipsis } = useLoadingMessages(ide.isLaunching)

    const showEmptyState = !ide.hasImported || (ide.hasImported && ide.files.length === 0 && !ide.isFetching)

    const renderLaunchButton = () => {
        if (ide.launchError) {
            return (
                <CompactStatusButton
                    icon={<WarningCircleIcon size={14} weight="fill" />}
                    primaryText="Launch failed"
                    secondaryText="Please try again later"
                    color="red"
                    onClick={ide.launchWorkspace}
                />
            )
        }

        if (ide.isLaunching) {
            return <CompactStatusButton primaryText="Launching IDE" secondaryText={messageWithEllipsis} loading />
        }

        return (
            <Button variant="outline" rightSection={<ArrowSquareOutIcon size={16} />} onClick={ide.launchWorkspace}>
                Launch IDE
            </Button>
        )
    }

    return (
        <Paper p="xl">
            <Text fz="sm" fw={700} c="gray.6" pb="sm">
                STEP 5 of 5
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
                        onClick={ide.importFiles}
                        loading={ide.isFetching}
                    >
                        Import files from IDE
                    </Button>
                </Group>
            </Group>

            {showEmptyState ? (
                <Box bg="gray.1" py={60} style={{ borderRadius: 8 }}>
                    <Stack align="center" gap="md">
                        <Text c="dimmed">
                            {ide.isFetching ? 'Loading files...' : 'You have not imported any files yet.'}
                        </Text>
                        {!ide.isFetching && (
                            <Button
                                variant="transparent"
                                leftSection={<DownloadSimpleIcon size={16} />}
                                onClick={ide.importFiles}
                                loading={ide.isFetching}
                            >
                                Import files from IDE
                            </Button>
                        )}
                    </Stack>
                </Box>
            ) : (
                <>
                    {ide.lastModified && (
                        <Text fz="sm" c="dimmed" mb="sm">
                            Last updated on{' '}
                            {new Date(ide.lastModified).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                            })}
                        </Text>
                    )}
                    <Radio.Group value={ide.mainFile} onChange={ide.setMainFile}>
                        <Table layout="fixed" verticalSpacing="md" highlightOnHover withTableBorder>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th w={100}>Main file</Table.Th>
                                    <Table.Th>File name</Table.Th>
                                    <Table.Th w={80}>Remove</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {ide.files.map((file) => (
                                    <Table.Tr key={file}>
                                        <Table.Td>
                                            <Radio value={file} />
                                        </Table.Td>
                                        <Table.Td>{file}</Table.Td>
                                        <Table.Td>
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                onClick={() => ide.removeFile(file)}
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
