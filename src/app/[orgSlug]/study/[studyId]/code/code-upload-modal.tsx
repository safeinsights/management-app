'use client'

import { FC } from 'react'
import {
    ActionIcon,
    Anchor,
    Button,
    Divider,
    Grid,
    GridCol,
    Group,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import {
    CheckCircleIcon,
    FileArrowUpIcon,
    UploadIcon,
    XCircleIcon,
    ArrowSquareOutIcon,
} from '@phosphor-icons/react/dist/ssr'
import { Language } from '@/database/types'
import { getAcceptedFormatsForLanguage } from '@/lib/languages'
import { ACCEPTED_FILE_TYPES } from '@/lib/types'
import { AppModal } from '@/components/modal'
import { getFileName } from '@/contexts/shared/file-types'
import { useCodeUploadModal } from '@/hooks/use-code-upload-modal'
import { useQuery } from '@/common'
import { getStarterCodeUrlAction } from '@/server/actions/org.actions'

interface CodeUploadModalProps {
    isOpen: boolean
    onClose: () => void
    language: Language
    orgSlug: string
    onConfirm: () => void
    isAddingFiles?: boolean
}

export const CodeUploadModal: FC<CodeUploadModalProps> = ({
    isOpen,
    onClose,
    language,
    orgSlug,
    onConfirm,
    isAddingFiles = false,
}) => {
    const theme = useMantineTheme()
    const { allFiles, handleDrop, handleReject, handleRemoveFile, handleConfirm, handleCancel, canConfirm } =
        useCodeUploadModal({ onConfirm, onClose, isAddingFiles })

    const { data: starterCodeData } = useQuery({
        queryKey: ['starter-code-url', orgSlug, language],
        queryFn: () => getStarterCodeUrlAction({ orgSlug, language }),
        enabled: isOpen,
    })

    const starterCodeUrl = starterCodeData?.starterCodeUrl

    return (
        <AppModal size="xl" isOpen={isOpen} onClose={onClose} title="Upload your code files">
            <Stack>
                <Group gap={0}>
                    <Text size="sm">
                        Upload your code file(s). Important: Make sure that your main file includes the &nbsp;
                    </Text>
                    <Text size="sm" c="blue.7" fw="bold">
                        Starter Code
                    </Text>
                    {starterCodeUrl && (
                        <Anchor href={starterCodeUrl} target="_blank" ml={4}>
                            <ArrowSquareOutIcon size={14} weight="bold" color={theme.colors.blue[7]} />
                        </Anchor>
                    )}
                    <Text size="sm">provided by the data organization.</Text>
                </Group>
                <Group grow justify="center" align="center" mt="md">
                    <Grid>
                        <GridCol span={{ base: 6, md: 5 }}>
                            <Dropzone
                                name="codeFiles"
                                onDrop={handleDrop}
                                onReject={handleReject}
                                multiple={true}
                                maxFiles={10}
                                accept={ACCEPTED_FILE_TYPES}
                                p="xl"
                                rejectColor="purple"
                            >
                                <Dropzone.Accept>
                                    <UploadIcon />
                                </Dropzone.Accept>
                                <Dropzone.Reject>
                                    <UploadIcon />
                                </Dropzone.Reject>
                                <Dropzone.Idle>
                                    <Stack>
                                        <Group gap="xs">
                                            <FileArrowUpIcon size={32} />
                                            <Text size="sm" c="dimmed">
                                                Drop your files or
                                            </Text>
                                            <Text fz="sm" c="purple.6" fw="bold">
                                                Browse
                                            </Text>
                                        </Group>
                                        <Text size="xs" c="dimmed">
                                            {getAcceptedFormatsForLanguage(language)}
                                        </Text>
                                    </Stack>
                                </Dropzone.Idle>
                            </Dropzone>
                        </GridCol>
                        <Divider orientation="vertical" />
                        <GridCol span={{ base: 4, md: 6 }}>
                            <Title order={5}>Uploaded files</Title>
                            <Stack gap="xs" mt="sm">
                                {allFiles.map((fileRef) => {
                                    const fileName = getFileName(fileRef)
                                    return (
                                        <Group key={fileName} gap="md" w="100%" justify="space-between">
                                            <Group gap="sm">
                                                <CheckCircleIcon
                                                    size={20}
                                                    color={theme.colors.green[9]}
                                                    weight="fill"
                                                />
                                                <Text size="sm">{fileName}</Text>
                                            </Group>
                                            <ActionIcon
                                                variant="transparent"
                                                aria-label={`Remove file ${fileName}`}
                                                onClick={() => handleRemoveFile(fileName)}
                                            >
                                                <XCircleIcon color={theme.colors.charcoal[4]} weight="fill" />
                                            </ActionIcon>
                                        </Group>
                                    )
                                })}
                            </Stack>
                        </GridCol>
                    </Grid>
                </Group>

                <Group>
                    <Button variant="outline" onClick={handleCancel}>
                        Cancel upload
                    </Button>
                    <Button onClick={handleConfirm} disabled={!canConfirm}>
                        Done
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
