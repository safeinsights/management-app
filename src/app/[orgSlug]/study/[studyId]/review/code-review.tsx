import { AlertNotFound } from '@/components/errors'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { codeReviewHeading } from '@/lib/code-review'
import { reviewerCodeNeedsReviewBanner } from '@/lib/study-banners'
import { type Submitted } from '@/schema/study'
import type { StepNav } from '@/lib/study-screen'
import { jobAnalysisForJob, latestJobForStudyOrNull } from '@/server/db/queries'
import { Box, Stack } from '@mantine/core'
import type { CodeReviewFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { CodeReviewClient } from './code-review-client'
import { latestCodeSubmittedAt } from '@/lib/study-job-status'
import { CollapsibleSubmittedCodeSection } from './collapsible-submitted-code-section'

type CodeReviewProps = {
    orgSlug: string
    study: Submitted<SelectedStudy>
    entries: CodeReviewFeedbackEntry[]
    nav: StepNav
    reviewVersion?: number
}

type PriorRoundFeedbackProps = {
    isVisible: boolean
    entries: CodeReviewFeedbackEntry[]
}

function PriorRoundFeedback({ isVisible, entries }: PriorRoundFeedbackProps) {
    if (!isVisible) return null
    return <FeedbackAndNotesSection entries={entries} alwaysExpandLatest />
}

type CodeReviewStatusBannerProps = {
    labName: string
    version: number
    submittedAt: Date | string | null
}

function CodeReviewStatusBanner({ labName, version, submittedAt }: CodeReviewStatusBannerProps) {
    const copy = reviewerCodeNeedsReviewBanner({ researchLab: labName, version })

    return (
        <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, submittedAt)}>
            {copy.body}
        </StatusAlert>
    )
}

export async function CodeReview({ orgSlug, study, entries, nav, reviewVersion = 1 }: CodeReviewProps) {
    const job = await latestJobForStudyOrNull(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const analysis = await jobAnalysisForJob(job)
    const latestJobStatus = job.statusChanges.at(0)?.status ?? null

    const isResubmission = reviewVersion > 1
    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const heading = codeReviewHeading(reviewVersion)
    const submittedAt = latestCodeSubmittedAt(job)

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                <CollapsibleSubmittedCodeSection
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    analysis={analysis}
                    stepLabel="STEP 2"
                    heading={heading}
                    banner={
                        <CodeReviewStatusBanner labName={labName} version={reviewVersion} submittedAt={submittedAt} />
                    }
                    initiallyExpanded={!isResubmission}
                >
                    <PriorRoundFeedback isVisible={isResubmission} entries={entries} />
                </CollapsibleSubmittedCodeSection>
                <CodeReviewClient
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    latestJobStatus={latestJobStatus}
                    nav={nav}
                />
            </Stack>
        </Box>
    )
}
