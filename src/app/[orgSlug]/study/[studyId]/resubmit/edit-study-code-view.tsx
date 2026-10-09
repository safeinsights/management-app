'use client'

import { FC, useState } from 'react'
import { Group, Stack } from '@mantine/core'
import { useIDEFiles, type StudyCodeIDE } from '@/hooks/use-ide-files'
import { NO_CHANGES_MESSAGE, SELECT_MAIN_FILE_MESSAGE } from '@/components/study/submit-code-error'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { IdeLaunchAction } from '@/components/study/launch-ide-control'
import { showsLaunchIdeControl } from '@/components/study/study-code-files'
import { YourFilesSection } from '@/components/study/your-files-section'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ResubmissionNoteSection } from '@/components/study/resubmission-note-section'
import { CodeSubmissionPresence } from '@/components/study/code-submission-presence'
import type { CodeReviewFeedbackEntry } from '@/server/actions/study.actions'
import { useEditCodeResubmit } from '@/contexts/edit-code-resubmit'
import { EditStudyCodeFooter } from './edit-study-code-footer'

const FILES_DESCRIPTION = 'View and manage your code files. You can update files, delete them, or upload new ones.'

/**
 * Deliberately not ide.submitDisabledReason: its third clause refuses an unchanged workspace, and
 * a note-only resubmission is legitimate here. Mirrors the other two clauses so the copy matches
 * the Submit code page.
 */
export const resubmitBlockedReason = (ide: StudyCodeIDE) => {
    if (ide.files.length === 0) return NO_CHANGES_MESSAGE
    if (ide.mainFile === '') return SELECT_MAIN_FILE_MESSAGE
    return null
}

interface EditStudyCodeViewProps {
    studyId: string
    orgName: string
    feedbackEntries: CodeReviewFeedbackEntry[]
    studyHasCodeEnv: boolean
}

export const EditStudyCodeView: FC<EditStudyCodeViewProps> = ({
    studyId,
    orgName,
    feedbackEntries,
    studyHasCodeEnv,
}) => {
    const ide = useIDEFiles({ studyId })
    const { noteForm, isSaving, lastSavedAt, presence } = useEditCodeResubmit()
    const [submitAttempted, setSubmitAttempted] = useState(false)

    const blockedReason = resubmitBlockedReason(ide)
    // Derived rather than snapshotted at click time, so fixing the problem clears the message.
    const submitError = submitAttempted ? blockedReason : null

    const headerAction = (
        <Group gap="md">
            <CodeSubmissionPresence {...presence} studyId={studyId} />
            <IdeLaunchAction
                ide={ide}
                isVisible={showsLaunchIdeControl({ ide, showLaunchIde: studyHasCodeEnv })}
                showLockHelper={false}
            />
        </Group>
    )

    return (
        <Stack gap="xxl">
            {/* The files sit inside the step header's card, so Launch IDE rides in its header row
                rather than the one the Submit code page gives the Code files card. */}
            <ProposalStepHeader stepLabel="STEP 3" heading="Edit code" action={headerAction}>
                <YourFilesSection
                    ide={ide}
                    dataPartnerName={orgName}
                    showLaunchIde={studyHasCodeEnv}
                    description={FILES_DESCRIPTION}
                    submitError={submitError}
                    isNested
                />
            </ProposalStepHeader>

            <FeedbackAndNotesSection entries={feedbackEntries} alwaysExpandLatest />

            <ResubmissionNoteSection noteForm={noteForm} orgName={orgName} autosaveStatus={{ isSaving, lastSavedAt }} />

            <EditStudyCodeFooter
                mainFileName={ide.mainFile}
                fileNames={ide.files}
                blockedReason={blockedReason}
                onSubmitAttempt={() => setSubmitAttempted(true)}
                filesEdited={ide.userEditedFiles}
            />
        </Stack>
    )
}
