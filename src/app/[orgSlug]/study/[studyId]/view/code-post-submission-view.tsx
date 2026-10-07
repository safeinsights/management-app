'use client'

import { type FC } from 'react'
import { Stack } from '@mantine/core'
import { displayOrgName } from '@/lib/string'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StepNavigation } from '@/components/study/step-navigation'
import { SubmittedCodeFilesSection } from '@/components/study/submitted-code-files-section'
import type { StepNav } from '@/lib/study-screen'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { CodeReviewFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { filterAndOrderCodeFiles } from '@/app/[orgSlug]/study/[studyId]/review/study-code-files'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { researcherCodeSubmittedBanner } from '@/lib/study-banners'
import { latestCodeSubmittedAt } from '@/lib/study-job-status'

interface CodePostSubmissionViewProps {
    study: SelectedStudy
    job: LatestJobForStudy
    reviewingOrgName: string
    nav: StepNav
    /** 1 = first submission, >=2 = resubmission round. */
    submissionVersion?: number
    feedbackEntries?: CodeReviewFeedbackEntry[]
    isUnderReview?: boolean
}

type UnderReviewBannerProps = {
    isVisible: boolean
    reviewingOrgName: string
    submissionVersion: number
    submittedAt: Date | string | null
}

const UnderReviewBanner: FC<UnderReviewBannerProps> = ({
    isVisible,
    reviewingOrgName,
    submissionVersion,
    submittedAt,
}) => {
    if (!isVisible) return null

    const copy = researcherCodeSubmittedBanner({
        dataPartner: displayOrgName(reviewingOrgName),
        version: submissionVersion,
    })

    return (
        <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, submittedAt)}>
            {copy.body}
        </StatusAlert>
    )
}

const FeedbackSection: FC<{ isVisible: boolean; entries: CodeReviewFeedbackEntry[] }> = ({ isVisible, entries }) => {
    if (!isVisible) return null
    return <FeedbackAndNotesSection entries={entries} alwaysExpandLatest />
}

export function CodePostSubmissionView({
    study,
    job,
    reviewingOrgName,
    nav,
    submissionVersion = 1,
    feedbackEntries = [],
    isUnderReview = true,
}: CodePostSubmissionViewProps) {
    const isResubmission = submissionVersion > 1
    const submittedAt = latestCodeSubmittedAt(job)
    const codeFiles = filterAndOrderCodeFiles(job.files)

    const banner = (
        <UnderReviewBanner
            isVisible={isUnderReview}
            reviewingOrgName={reviewingOrgName}
            submissionVersion={submissionVersion}
            submittedAt={submittedAt}
        />
    )

    return (
        <Stack p="xl" gap="xxl">
            <StudyPageHeader study={study} />

            <Stack gap="xxl">
                <ProposalStepHeader stepLabel="STEP 3" heading="Submit code" banner={banner} />

                <SubmittedCodeFilesSection studyId={study.id} jobId={job.id} files={codeFiles} />

                <FeedbackSection isVisible={isResubmission && feedbackEntries.length > 0} entries={feedbackEntries} />

                <StepNavigation nav={nav} />
            </Stack>
        </Stack>
    )
}
