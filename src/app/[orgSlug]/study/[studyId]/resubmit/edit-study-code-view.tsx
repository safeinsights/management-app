'use client'

import { FC } from 'react'
import { Group, Stack, Text } from '@mantine/core'
import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { InfoTooltip } from '@/components/tooltip'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StudyCodePanel } from '@/components/study/study-code-panel'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ResubmissionNoteSection } from '@/components/study/resubmission-note-section'
import type { CodeReviewFeedbackEntry } from '@/server/actions/study.actions'
import { useEditCodeResubmit } from '@/contexts/edit-code-resubmit'
import { EditStudyCodeFooter } from './edit-study-code-footer'

interface EditStudyCodeViewProps {
    studyId: string
    studyTitle: string
    orgName: string
    submittedAt: Date | null
    feedbackEntries: CodeReviewFeedbackEntry[]
    studyHasCodeEnv: boolean
}

const MAIN_FILE_TOOLTIP =
    "If you're creating or uploading multiple files, please select your main file (i.e., the script that runs first)."

const IDE_BUTTON_TOOLTIP =
    'After creating or editing files in the IDE, please return here to submit your code to the Data Partner.'

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
    submittedAt,
    feedbackEntries,
    studyHasCodeEnv,
}) => {
    const ide = useIDEFiles({ studyId })
    const { noteForm, isSaving, lastSavedAt } = useEditCodeResubmit()

    return (
        <Stack gap="xxl">
            <ProposalStepHeader
                stepLabel="STEP 4"
                heading="Edit study code"
                studyTitle={studyTitle}
                timestampDate={submittedAt}
            />

            <StudyCodePanel
                ide={ide}
                studyTitle={studyTitle}
                mainFileColumnHeader={<MainFileColumnHeader />}
                showLaunchIde={studyHasCodeEnv}
                ideButtonTooltip={IDE_BUTTON_TOOLTIP}
                footer={null}
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
