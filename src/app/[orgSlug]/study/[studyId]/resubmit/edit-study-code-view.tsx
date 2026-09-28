'use client'

import { FC } from 'react'
import { Stack } from '@mantine/core'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { IdeLaunchAction } from '@/components/study/launch-ide-control'
import { showsLaunchIdeControl } from '@/components/study/study-code-files'
import { YourFilesSection } from '@/components/study/your-files-section'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ResubmissionNoteSection } from '@/components/study/resubmission-note-section'
import type { CodeReviewFeedbackEntry } from '@/server/actions/study.actions'
import { useEditCodeResubmit } from '@/contexts/edit-code-resubmit'
import { EditStudyCodeFooter } from './edit-study-code-footer'

const FILES_DESCRIPTION = 'View and manage your code files. You can update files, delete them, or upload new ones.'

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
    const { noteForm, isSaving, lastSavedAt } = useEditCodeResubmit()

    const launchIde = (
        <IdeLaunchAction ide={ide} isVisible={showsLaunchIdeControl({ ide, showLaunchIde: studyHasCodeEnv })} />
    )

    return (
        <Stack gap="xxl">
            {/* The files sit inside the step header's card, so Launch IDE rides in its header row
                rather than the one the Submit code page gives the Code files card. */}
            <ProposalStepHeader stepLabel="STEP 3" heading="Edit code" action={launchIde}>
                <YourFilesSection
                    ide={ide}
                    dataPartnerName={orgName}
                    showLaunchIde={studyHasCodeEnv}
                    description={FILES_DESCRIPTION}
                    isNested
                />
            </ProposalStepHeader>

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
