'use client'

import { FC } from 'react'
import { Stack } from '@mantine/core'
import { useIDEFiles } from '@/hooks/use-ide-files'
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
    feedbackEntries: CodeReviewFeedbackEntry[]
    studyHasCodeEnv: boolean
}

export const EditStudyCodeView: FC<EditStudyCodeViewProps> = ({
    studyId,
    studyTitle,
    orgName,
    feedbackEntries,
    studyHasCodeEnv,
}) => {
    const ide = useIDEFiles({ studyId })
    const { noteForm, isSaving, lastSavedAt } = useEditCodeResubmit()

    return (
        <Stack gap="xxl">
            <StudyCodePanel
                ide={ide}
                studyTitle={studyTitle}
                stepLabel="STEP 4"
                heading="Edit study code"
                showLaunchIde={studyHasCodeEnv}
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
