import { Box, Stack } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { OutputsDecidedBanner } from '@/components/study/outputs-decided-banner'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { DecryptAndViewOutputs } from '@/components/study/decrypt-and-view-outputs'
import { jobHasDecryptableRunOutcome } from '@/lib/file-type-helpers'
import { latestStatusAt } from '@/lib/study-job-status'
import type { RawStudyState, StepNav } from '@/lib/study-screen'
import { projectStudyState } from '@/lib/study-screen'
import { latestSubmittedJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import type { OutputsDecisionFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { loadOutputsFeedback } from '../view/load-outputs-feedback'

type ReviewerOutputsDecidedProps = {
    study: SelectedStudy
    raw: RawStudyState
    nav: StepNav
}

function outputsDecisionAttribution(
    entries: OutputsDecisionFeedbackEntry[],
    statusChanges: LatestJobForStudy['statusChanges'],
) {
    const latestDecision = entries[0]
    return {
        reviewerName: latestDecision?.authorName ?? null,
        decidedAt:
            latestDecision?.createdAt ??
            latestStatusAt(statusChanges, 'FILES-APPROVED') ??
            latestStatusAt(statusChanges, 'FILES-REJECTED'),
    }
}

export async function ReviewerOutputsDecided({ study, raw, nav }: ReviewerOutputsDecidedProps) {
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
    const { entries: feedbackEntries, feedbackLoadError } = await loadOutputsFeedback(study.id)
    const { reviewerName, decidedAt } = outputsDecisionAttribution(feedbackEntries, job.statusChanges)

    // A run closed out with nothing to decrypt must not ask for a key that cannot work; a
    // submission-time scan log does not count as an output (OTTER-524).
    const hasDecryptableOutputs = jobHasDecryptableRunOutcome(job.files ?? [])

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                <ProposalStepHeader
                    stepLabel="STEP 3"
                    heading="Review outputs"
                    banner={
                        <OutputsDecidedBanner
                            resultsErrored={state.resultsErrored}
                            resultsApproved={state.resultsApproved}
                            labName={labName}
                            reviewerName={reviewerName}
                            decidedAt={decidedAt}
                        />
                    }
                />
                <FeedbackAndNotesSection entries={feedbackEntries} loadError={feedbackLoadError} alwaysExpandLatest />
                <DecryptAndViewOutputs job={job} isVisible={hasDecryptableOutputs} />
                <StepNavigation nav={nav} />
            </Stack>
        </Box>
    )
}
