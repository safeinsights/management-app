'use client'

import { FC } from 'react'
import { Group, Stack, Text, Tooltip } from '@mantine/core'
import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StudyCodePanel } from '@/components/study/study-code-panel'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import type { CodeReviewFeedbackEntry } from '@/server/actions/study.actions'
import { ResubmissionNoteSection } from './resubmission-note-section'
import { EditStudyCodeFooter } from './edit-study-code-footer'

interface EditStudyCodeViewProps {
    studyId: string
    studyTitle: string
    orgName: string
    submittedAt: Date | null
    feedbackEntries: CodeReviewFeedbackEntry[]
    studyHasCodeEnv: boolean
}

const MainFileColumnHeader: FC = () => (
    <Group gap={4} wrap="nowrap" align="center">
        <Text component="span" inherit>
            Main file
        </Text>
        <Tooltip label="The script that runs first when your code is executed." withArrow>
            <Text component="span" display="inline-flex" aria-label="Main file info">
                <InfoIcon size={14} weight="regular" aria-hidden />
            </Text>
        </Tooltip>
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
                footer={null}
            />

            <FeedbackAndNotesSection entries={feedbackEntries} />

            <ResubmissionNoteSection orgName={orgName} />

            <EditStudyCodeFooter mainFileName={ide.mainFile} fileNames={ide.files} hasFiles={ide.files.length > 0} />
        </Stack>
    )
}
