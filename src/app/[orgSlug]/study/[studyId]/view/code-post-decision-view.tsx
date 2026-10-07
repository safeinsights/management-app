'use client'

import { type FC } from 'react'
import { Stack } from '@mantine/core'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { SubmittedCodeFilesSection } from '@/components/study/submitted-code-files-section'
import { filterAndOrderCodeFiles } from '@/app/[orgSlug]/study/[studyId]/review/study-code-files'
import { displayOrgName } from '@/lib/string'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { researcherCodeDecisionBanner, type BannerCopy } from '@/lib/study-banners'
import { type Submitted } from '@/schema/study'
import type { CodeReviewFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { type CodeDecisionStatus } from '@/lib/study-job-status'
import type { StepNav } from '@/lib/study-screen'

interface CodePostDecisionViewProps {
    study: Submitted<SelectedStudy>
    job: LatestJobForStudy
    entries: CodeReviewFeedbackEntry[]
    reviewingOrgName: string
    latestJobStatus: CodeDecisionStatus
    nav: StepNav
    feedbackLoadError?: boolean
}

function deriveCodePostDecision({
    job,
    entries,
    decision,
}: {
    job: LatestJobForStudy
    entries: CodeReviewFeedbackEntry[]
    decision: CodeDecisionStatus
}) {
    return {
        timestampDate: job.statusChanges.find((s) => s.status === decision)?.createdAt ?? entries[0]?.createdAt ?? null,
        codeFiles: filterAndOrderCodeFiles(job.files),
    }
}

const DecisionBanner: FC<{ copy: BannerCopy; decidedAt: Date | string | null }> = ({ copy, decidedAt }) => (
    <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, decidedAt)}>
        {copy.body}
    </StatusAlert>
)

export function CodePostDecisionView({
    study,
    job,
    entries,
    reviewingOrgName,
    latestJobStatus,
    nav,
    feedbackLoadError = false,
}: CodePostDecisionViewProps) {
    const { timestampDate, codeFiles } = deriveCodePostDecision({ job, entries, decision: latestJobStatus })
    const copy = researcherCodeDecisionBanner(latestJobStatus, { dataPartner: displayOrgName(reviewingOrgName) })

    const banner = <DecisionBanner copy={copy} decidedAt={timestampDate} />

    return (
        <Stack p="xl" gap="xxl">
            <StudyPageHeader study={study} />

            <Stack gap="xxl">
                <ProposalStepHeader stepLabel="STEP 3" heading="Submit code" banner={banner} />

                <SubmittedCodeFilesSection studyId={study.id} jobId={job.id} files={codeFiles} />

                <FeedbackAndNotesSection entries={entries} loadError={feedbackLoadError} alwaysExpandLatest />
                <StepNavigation nav={nav} />
            </Stack>
        </Stack>
    )
}
