'use client'

import { FC, useRef } from 'react'
import { Box, Divider, Group, Stack, Text, Title } from '@mantine/core'
import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { InfoTooltip } from '@/components/tooltip'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { StudyCodePanel } from '@/components/study/study-code-panel'
import { LaunchIdeButton } from '@/components/study/launch-ide-button'
import { UploadFilesButton } from '@/components/study/upload-files-button'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ResubmissionNoteSection } from '@/components/study/resubmission-note-section'
import type { CodeReviewFeedbackEntry } from '@/server/actions/study.actions'
import { useEditCodeResubmit } from '@/contexts/edit-code-resubmit'
import { EditStudyCodeFooter } from './edit-study-code-footer'

interface EditStudyCodeViewProps {
    studyId: string
    studyTitle: string
    orgName: string
    feedbackEntries: CodeReviewFeedbackEntry[]
    studyHasCodeEnv: boolean
}

const MAIN_FILE_TOOLTIP =
    "If you're creating or uploading multiple files, please select your main file (i.e., the script that runs first)."

const IDE_BUTTON_TOOLTIP =
    'After creating or editing files in the IDE, please return here to submit your code to the data organization.'

const MainFileColumnHeader: FC = () => (
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

export const EditStudyCodeView: FC<EditStudyCodeViewProps> = ({
    studyId,
    studyTitle,
    orgName,
    feedbackEntries,
    studyHasCodeEnv,
}) => {
    const ide = useIDEFiles({ studyId })
    const { noteForm, isSaving, lastSavedAt } = useEditCodeResubmit()
    const uploadOpenRef = useRef<() => void>(null)

    // Mirror StudyCodeReviewView: the file actions only make sense once the existing files have loaded.
    const showFileActions = !ide.isLoadingFiles && !ide.showEmptyState

    const launchIdeButton = (
        <InfoTooltip label={IDE_BUTTON_TOOLTIP} withArrow multiline w={320}>
            <LaunchIdeButton
                onClick={ide.launchWorkspace}
                isLaunching={ide.isLaunching}
                launchError={ide.launchError}
                variant="outline"
            />
        </InfoTooltip>
    )

    const header = (
        <Stack gap="lg">
            <Group justify="space-between" align="center" wrap="nowrap">
                <Box>
                    <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                        STEP 4
                    </Text>
                    <Title order={4} fz={20} c="charcoal.9" pb={4}>
                        Edit study code
                    </Title>
                    <Text c="charcoal.9" style={{ maxWidth: '105ch', wordBreak: 'break-word' }}>
                        Title: {studyTitle}
                    </Text>
                </Box>
                {showFileActions && (
                    <Group wrap="nowrap">
                        {studyHasCodeEnv && launchIdeButton}
                        <UploadFilesButton openRef={uploadOpenRef} disabled={ide.isUploading} />
                    </Group>
                )}
            </Group>
            <Divider />
        </Stack>
    )

    return (
        <Stack gap="xxl">
            <StudyCodePanel
                ide={ide}
                studyTitle={studyTitle}
                mainFileColumnHeader={<MainFileColumnHeader />}
                showLaunchIde={studyHasCodeEnv}
                ideButtonTooltip={IDE_BUTTON_TOOLTIP}
                footer={null}
                header={header}
                hideReviewActions
                uploadOpenRef={uploadOpenRef}
            />

            <FeedbackAndNotesSection entries={feedbackEntries} alwaysExpandLatest />

            <ResubmissionNoteSection noteForm={noteForm} orgName={orgName} autosaveStatus={{ isSaving, lastSavedAt }} />

            <EditStudyCodeFooter
                mainFileName={ide.mainFile}
                fileNames={ide.files}
                hasFiles={ide.files.length > 0}
                filesEdited={ide.userEditedFiles}
            />
        </Stack>
    )
}
