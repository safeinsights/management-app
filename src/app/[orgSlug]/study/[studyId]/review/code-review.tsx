import type { ReactNode } from 'react'
import { AlertNotFound } from '@/components/errors'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { ReviewCriteriaBanner } from '@/components/study/review-criteria-banner'
import { Routes } from '@/lib/routes'
import { type Submitted } from '@/schema/study'
import { getStudyReviewForJob, jobScanResultForJob, latestJobForStudyOrNull } from '@/server/db/queries'
import { Box, Stack, Title } from '@mantine/core'
import type { CodeReviewFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { CodeReviewClient } from './code-review-client'
import { CODE_REVIEW_BANNER_CRITERIA } from './code-review-criteria'
import { SubmittedCodeSection } from './submitted-code-section'

type CodeReviewProps = {
    orgSlug: string
    study: Submitted<SelectedStudy>
    entries: CodeReviewFeedbackEntry[]
}

// Each code job becomes a review round (v1, v2, …) in getCodeReviewFeedbackAction.
// On the *current* round the page is rendered for, entries are only present when
// at least one prior round exists, so any entry implies a resubmission.
function deriveCodeReviewVersion(entries: CodeReviewFeedbackEntry[]): number {
    if (entries.length === 0) return 1
    const versions = entries.map((entry) => entry.version).filter((v): v is number => v != null)
    if (versions.length === 0) return 1
    return Math.max(...versions)
}

function codeReviewHeading(version: number): string {
    if (version <= 1) return 'Review study code'
    return `Review study code v${version}.0`
}

function firstSubmissionIntro(labName: string): ReactNode {
    return (
        <>
            {labName} has submitted their study code for review. Below, you will review their code and an AI-generated
            summary of its behavior, then share your feedback and decision. Consider evaluating the code based on these
            criteria:
        </>
    )
}

function resubmissionIntro(labName: string): ReactNode {
    return (
        <>
            {labName} has resubmitted their study code for review. Below, you will review their code and an AI-generated
            summary of its behavior, then share your feedback and decision. Consider evaluating the code based on these
            criteria:
        </>
    )
}

type CodeReviewStatusBannerProps = {
    labName: string
    isResubmission: boolean
}

function CodeReviewStatusBanner({ labName, isResubmission }: CodeReviewStatusBannerProps) {
    const intro = isResubmission ? resubmissionIntro(labName) : firstSubmissionIntro(labName)
    return (
        <ReviewCriteriaBanner
            testId="code-review-status-banner"
            criteriaTestId="code-review-criteria"
            intro={intro}
            criteria={CODE_REVIEW_BANNER_CRITERIA}
        />
    )
}

type CodeReviewSectionProps = {
    study: Submitted<SelectedStudy>
    submittedAt: Date | string
    isResubmission: boolean
    version: number
}

function CodeReviewSection({ study, submittedAt, isResubmission, version }: CodeReviewSectionProps) {
    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const timestampLabel = isResubmission ? 'Resubmitted on' : 'Submitted on'
    const heading = codeReviewHeading(version)

    return (
        <ProposalStepHeader
            stepLabel="STEP 3"
            heading={heading}
            studyTitle={study.title}
            timestampDate={submittedAt}
            timestampLabel={timestampLabel}
            banner={<CodeReviewStatusBanner labName={labName} isResubmission={isResubmission} />}
        />
    )
}

export async function CodeReview({ orgSlug, study, entries }: CodeReviewProps) {
    const job = await latestJobForStudyOrNull(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const [review, scan] = await Promise.all([getStudyReviewForJob(job.id), jobScanResultForJob(job.id)])
    const proposalHref = `${Routes.studyReview({ orgSlug, studyId: study.id })}?from=code-review`
    const previousHref = Routes.studyAgreements({ orgSlug, studyId: study.id, from: 'previous' })
    const latestJobStatus = job.statusChanges.at(0)?.status ?? null

    const version = deriveCodeReviewVersion(entries)
    const isResubmission = version > 1

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs
                    crumbs={[
                        ['Dashboard', Routes.orgDashboard({ orgSlug })],
                        ['Study proposal', proposalHref],
                        ['Study code'],
                    ]}
                />
                <Title order={1} fz={40} fw={700}>
                    Study Proposal
                </Title>
                <CodeReviewSection
                    study={study}
                    submittedAt={job.createdAt}
                    isResubmission={isResubmission}
                    version={version}
                />
                <SubmittedCodeSection
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    review={review}
                    scan={scan}
                    codeInitiallyExpanded={!isResubmission}
                />
                {isResubmission && <FeedbackAndNotesSection entries={entries} alwaysExpandLatest />}
                <CodeReviewClient
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    latestJobStatus={latestJobStatus}
                    previousHref={previousHref}
                />
            </Stack>
        </Box>
    )
}
