import { useRef, type FC } from 'react'
import { Anchor, Box, Divider, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import type { FileWithPath } from '@mantine/dropzone'
import { ACCEPTED_FILE_FORMATS_TEXT } from '@/lib/types'
import { FileDropOverlay } from './file-drop-overlay'
import { LaunchIdeControl } from './launch-ide-control'
import { LaunchProgress } from './launch-progress'
import { UploadFilesButton } from './upload-files-button'
import { fontWeight } from '@/theme/tokens'

interface StarterFile {
    name: string
    url: string
}

interface StudyCodeEmptyViewProps {
    launchWorkspace: (options?: { sameWindow?: boolean }) => void
    isLaunching: boolean
    launchLastUpdatedAt?: Date | null
    launchBuildLog?: string
    launchAgentLog?: string
    uploadFiles: (files: FileWithPath[]) => void
    isUploading: boolean
    starterFiles: StarterFile[]
    showLaunchIde?: boolean
    /** False once the round has been submitted: nothing here may add code any more (OTTER-693). */
    isEditable?: boolean
    isIdeClaimed: boolean
    canEditInIde: boolean
    ideOwnerName: string | null
}

type WriteCodeInIdePanelProps = Pick<
    StudyCodeEmptyViewProps,
    'isIdeClaimed' | 'canEditInIde' | 'ideOwnerName' | 'isLaunching' | 'launchWorkspace'
> & {
    isVisible: boolean
    launchBuildLog: string
    launchAgentLog: string
    launchLastUpdatedAt?: Date | null
}

const WriteCodeInIdePanel: FC<WriteCodeInIdePanelProps> = ({
    isVisible,
    isIdeClaimed,
    canEditInIde,
    ideOwnerName,
    isLaunching,
    launchWorkspace,
    launchBuildLog,
    launchAgentLog,
    launchLastUpdatedAt,
}) => {
    if (!isVisible) return null

    return (
        <>
            <Paper bg="violet.0" p="lg" radius="md">
                <Stack gap="sm">
                    <Text fw={fontWeight.bold}>Write and test your code in IDE (recommended)</Text>
                    <Text size="sm" c="dimmed">
                        IDE is pre-configured to help you write your code and test it against example data. It will open
                        in a new tab and you can write your code there. All files created in the IDE will populate here.
                    </Text>
                    <Box>
                        <LaunchIdeControl
                            isClaimed={isIdeClaimed}
                            canLaunch={canEditInIde}
                            ideOwnerName={ideOwnerName}
                            isLaunching={isLaunching}
                            onLaunch={launchWorkspace}
                            align="flex-start"
                        />
                    </Box>
                    <LaunchProgress
                        isVisible={isLaunching}
                        buildLog={launchBuildLog}
                        agentLog={launchAgentLog}
                        lastUpdatedAt={launchLastUpdatedAt}
                    />
                    <Text size="sm">
                        <Text span fw={fontWeight.bold}>
                            Note:{' '}
                        </Text>
                        After creating or editing files in the IDE, please return here to submit your code to the Data
                        Partner.
                    </Text>
                </Stack>
            </Paper>
            <Divider label="OR" labelPosition="center" my="sm" />
        </>
    )
}

export function StudyCodeEmptyView({
    launchWorkspace,
    isLaunching,
    launchLastUpdatedAt,
    launchBuildLog = '',
    launchAgentLog = '',
    uploadFiles,
    isUploading,
    starterFiles,
    showLaunchIde = true,
    isEditable = true,
    isIdeClaimed,
    canEditInIde,
    ideOwnerName,
}: StudyCodeEmptyViewProps) {
    const openRef = useRef<() => void>(null)
    const starterLink = starterFiles[0]
    const showIdeOption = isEditable && showLaunchIde
    const isUploadDisabled = !isEditable || isUploading

    return (
        <Stack gap="md">
            <Text size="sm">
                To prepare your code, upload existing files
                {showIdeOption ? ' or write new code in our Integrated Development Environment (IDE)' : ''}. Once ready,
                submit your files to the Data Partner to run against their dataset.
            </Text>

            <WriteCodeInIdePanel
                isVisible={showIdeOption}
                isIdeClaimed={isIdeClaimed}
                canEditInIde={canEditInIde}
                ideOwnerName={ideOwnerName}
                isLaunching={isLaunching}
                launchWorkspace={launchWorkspace}
                launchBuildLog={launchBuildLog}
                launchAgentLog={launchAgentLog}
                launchLastUpdatedAt={launchLastUpdatedAt}
            />

            <FileDropOverlay onDrop={uploadFiles} disabled={isUploadDisabled} showHelperText={false} openRef={openRef}>
                <Paper withBorder p="lg" radius="md">
                    <Stack gap="sm">
                        <Text fw={fontWeight.bold}>Upload your files</Text>
                        <Text size="sm" c="dimmed">
                            Make sure that your main file contains the <StarterCodeLink file={starterLink} /> provided
                            by the Data Partner for accessing their datasets. You may also continue to edit your
                            uploaded files in the IDE before submitting them to the Data Partner.
                        </Text>
                        <Box mt="sm">
                            <Stack gap="xs" align="flex-start">
                                <ThemeIcon variant="light" color="grey" size="xl" radius="md">
                                    <FileArrowUpIcon size={24} />
                                </ThemeIcon>
                                <Text fw={fontWeight.semibold}>Drop your files</Text>
                                <Text size="xs" c="dimmed">
                                    {ACCEPTED_FILE_FORMATS_TEXT}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    10MB max
                                </Text>
                                <UploadFilesButton openRef={openRef} disabled={isUploadDisabled} />
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
