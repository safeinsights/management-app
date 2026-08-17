import { Box, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import type { FC } from 'react'
import { AlertNotFound } from '@/components/errors'
import { ButtonLink } from '@/components/links'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { OutputsDecidedBanner } from '@/components/study/outputs-decided-banner'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { DecryptAndViewOutputs } from '@/components/study/decrypt-and-view-outputs'
import { Routes } from '@/lib/routes'
import { latestStatusAt } from '@/lib/study-job-status'
import type { RawStudyState } from '@/lib/study-screen'
import { projectStudyState } from '@/lib/study-screen'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import type { OutputsDecisionFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { loadOutputsFeedback } from '../view/load-outputs-feedback'

type ReviewerOutputsDecidedProps = {
    orgSlug: string
    study: SelectedStudy
    raw: RawStudyState
}

const FeedbackSection: FC<{ feedbackLoadError: boolean; entries: OutputsDecisionFeedbackEntry[] }> = ({
    feedbackLoadError,
    entries,
}) => {
    if (feedbackLoadError) {
        return <AlertNotFound title="Feedback could not be loaded" message="Please refresh and try again" />
    }
    return <FeedbackAndNotesSection entries={entries} alwaysExpandLatest />
}

export async function ReviewerOutputsDecided({ study, orgSlug, raw }: ReviewerOutputsDecidedProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const state = projectStudyState(raw)
    if (!state.hasResults) {
        return (
            <AlertNotFound
                title="No decision found"
                message="No outputs decision has been recorded for this study yet."
            />
        )
    }

    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const decidedAt =
        latestStatusAt(job.statusChanges, 'FILES-APPROVED') ?? latestStatusAt(job.statusChanges, 'FILES-REJECTED')

    const { entries: feedbackEntries, feedbackLoadError } = await loadOutputsFeedback(study.id)

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ProposalStepHeader
                    stepLabel="STEP 3"
                    heading="Review outputs"
                    studyTitle={study.title ?? ''}
                    banner={
                        <OutputsDecidedBanner
                            resultsErrored={state.resultsErrored}
                            resultsApproved={state.resultsApproved}
                            labName={labName}
                            decidedAt={decidedAt}
                        />
                    }
                />
                <FeedbackSection feedbackLoadError={feedbackLoadError} entries={feedbackEntries} />
                <DecryptAndViewOutputs job={job} />
                <Group justify="space-between">
                    <ButtonLink
                        href={Routes.studyReviewCode({ orgSlug, studyId: study.id })}
                        variant="subtle"
                        leftSection={<CaretLeftIcon />}
                    >
                        Previous step
                    </ButtonLink>
                    <ButtonLink href={Routes.dashboard} variant="filled" size="md">
                        Back to my studies
                    </ButtonLink>
                </Group>
            </Stack>
        </Box>
    )
}
