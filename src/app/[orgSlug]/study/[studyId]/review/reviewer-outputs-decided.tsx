import { Box, Group, Stack } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ButtonLink } from '@/components/links'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { OutputsDecidedBanner } from '@/components/study/outputs-decided-banner'
import { PreviousStepLink } from '@/components/study/previous-step-link'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { DecryptAndViewOutputs } from '@/components/study/decrypt-and-view-outputs'
import { jobHasDecryptableRunOutcome } from '@/lib/file-type-helpers'
import { Routes } from '@/lib/routes'
import { latestStatusAt } from '@/lib/study-job-status'
import type { RawStudyState } from '@/lib/study-screen'
import { projectStudyState } from '@/lib/study-screen'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { loadOutputsFeedback } from '../view/load-outputs-feedback'

type ReviewerOutputsDecidedProps = {
    orgSlug: string
    study: SelectedStudy
    raw: RawStudyState
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

    // A run closed out with nothing to decrypt must not come back here asking for a key that cannot
    // work (OTTER-524). The same question the errored screen asks, and for the same reason: this form
    // promises the reviewer their outputs, so a job whose only encrypted artifact is a scan log must
    // not satisfy it either. That log is written by the code scanner at submission, says nothing about
    // the run, and is already on the code review step, so returning it under "View outputs again"
    // would rebuild on this screen exactly the conflation the errored screen now refuses to make.
    const hasDecryptableOutputs = jobHasDecryptableRunOutcome(job.files ?? [])

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
                <FeedbackAndNotesSection entries={feedbackEntries} loadError={feedbackLoadError} alwaysExpandLatest />
                <DecryptAndViewOutputs job={job} isVisible={hasDecryptableOutputs} />
                <Group justify="space-between">
                    <PreviousStepLink previousHref={Routes.studyReviewCode({ orgSlug, studyId: study.id })} />
                    <ButtonLink href={Routes.dashboard} variant="filled" size="md">
                        Back to my studies
                    </ButtonLink>
                </Group>
            </Stack>
        </Box>
    )
}
