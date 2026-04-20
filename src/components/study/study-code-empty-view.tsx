import { useRef } from 'react'
import { Anchor, Box, Divider, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import type { FileWithPath } from '@mantine/dropzone'
import { ACCEPTED_FILE_FORMATS_TEXT } from '@/lib/types'
import { FileDropOverlay } from './file-drop-overlay'
import { LaunchIdeButton } from './launch-ide-button'
import { UploadFilesButton } from './upload-files-button'

interface StarterFile {
    name: string
    url: string
}

interface StudyCodeEmptyViewProps {
    launchWorkspace: () => void
    isLaunching: boolean
    launchError: Error | null
    uploadFiles: (files: FileWithPath[]) => void
    isUploading: boolean
    starterFiles: StarterFile[]
}

export function StudyCodeEmptyView({
    launchWorkspace,
    isLaunching,
    launchError,
    uploadFiles,
    isUploading,
    starterFiles,
}: StudyCodeEmptyViewProps) {
    const openRef = useRef<() => void>(null)
    const starterLink = starterFiles[0]

    return (
        <Stack gap="md">
            <Text size="sm">
                To prepare your code, upload existing files or write new code in our Integrated Development Environment
                (IDE). Once ready, submit your files to the Data Organization to run against their dataset.
            </Text>

            <Paper bg="violet.0" p="lg" radius="md">
                <Stack gap="sm">
                    <Text fw={700}>Write and test your code in IDE (recommended)</Text>
                    <Text size="sm" c="dimmed">
                        IDE is pre-configured to help you write your code and test it against sample data. It will open
                        in a new tab and you can write your code there. All files created in the IDE will populate here.
                    </Text>
                    <Box>
                        <LaunchIdeButton
                            onClick={launchWorkspace}
                            isLaunching={isLaunching}
                            launchError={launchError}
                            variant="cta"
                        />
                    </Box>
                    <Text size="sm">
                        <Text span fw={700}>
                            Note:{' '}
                        </Text>
                        After creating or editing files in the IDE, please return here to submit your code to the Data
                        Organization.
                    </Text>
                </Stack>
            </Paper>

            <Divider label="OR" labelPosition="center" my="sm" />

            <FileDropOverlay onDrop={uploadFiles} disabled={isUploading} showHelperText={false} openRef={openRef}>
                <Paper withBorder p="lg" radius="md">
                    <Stack gap="sm">
                        <Text fw={700}>Upload your files</Text>
                        <Text size="sm" c="dimmed">
                            Make sure that your main file contains the <StarterCodeLink file={starterLink} /> provided
                            by the Data Organization for accessing their datasets. You may also continue to edit your
                            uploaded files in the IDE before submitting them to the Data Organization.
                        </Text>
                        <Box mt="sm">
                            <Stack gap="xs" align="flex-start">
                                <ThemeIcon variant="light" color="gray" size="xl" radius="md">
                                    <FileArrowUpIcon size={24} />
                                </ThemeIcon>
                                <Text fw={600}>Drop your files</Text>
                                <Text size="xs" c="dimmed">
                                    {ACCEPTED_FILE_FORMATS_TEXT}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    10MB max
                                </Text>
                                <UploadFilesButton openRef={openRef} disabled={isUploading} />
                            </Stack>
                        </Box>
                    </Stack>
                </Paper>
            </FileDropOverlay>
        </Stack>
    )
}

function StarterCodeLink({ file }: { file: StarterFile | undefined }) {
    if (!file) return <>starter code</>
    return (
        <Anchor href={file.url} target="_blank">
            Starter code
        </Anchor>
    )
}
