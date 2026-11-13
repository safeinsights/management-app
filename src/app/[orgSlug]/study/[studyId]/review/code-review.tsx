import { semanticColor } from '@/theme/tokens'
import { AlertNotFound } from '@/components/errors'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { StudyPageHeader } from '@/components/study/study-page-header'
import type { PageHeaderStep } from '@/components/page-header'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { codeReviewHeading } from '@/lib/code-review'
import { reviewerCodeNeedsReviewBanner } from '@/lib/study-banners'
import { type Submitted } from '@/schema/study'
import type { StepNav } from '@/lib/study-screen'
import { jobAnalysisForJob, latestJobForStudyOrNull } from '@/server/db/queries'
import { Box } from '@mantine/core'
import type { CodeReviewFeedbackEntry } from '@/server/actions/review-feedback.actions'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { CodeReviewClient } from './code-review-client'
import { latestCodeSubmittedAt } from '@/lib/study-job-status'
import { CollapsibleSubmittedCodeSection } from './collapsible-submitted-code-section'
import { StudyPageLayout } from '@/components/study/study-page-layout'

type CodeReviewProps = {
    orgSlug: string
    study: Submitted<SelectedStudy>
    entries: CodeReviewFeedbackEntry[]
    nav: StepNav
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

export async function CodeReview({ orgSlug, study, entries, nav }: CodeReviewProps) {
    const job = await latestJobForStudyOrNull(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const analysis = await jobAnalysisForJob(job)
    const latestJobStatus = job.currentStatus

    const reviewVersion = job.round
    const isResubmission = reviewVersion > 1
    const labName = study.submittingLabName
    const step: PageHeaderStep = { label: 'Step 2', heading: codeReviewHeading(reviewVersion) }
    const submittedAt = latestCodeSubmittedAt(job)

    return (
        <Box bg={semanticColor('surface.page')}>
            <StudyPageLayout header={<StudyPageHeader study={study} step={step} />}>
                <CollapsibleSubmittedCodeSection
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    analysis={analysis}
                    stepLabel={step.label}
                    heading={step.heading}
                    banner={
                        <CodeReviewStatusBanner labName={labName} version={reviewVersion} submittedAt={submittedAt} />
                    }
                    initiallyExpanded={!isResubmission}
                >
                    <FeedbackAndNotesSection isVisible={isResubmission} entries={entries} alwaysExpandLatest />
                </CollapsibleSubmittedCodeSection>
                <CodeReviewClient
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    latestJobStatus={latestJobStatus}
                    nav={nav}
                />
            </StudyPageLayout>
        </Box>
    )
}
