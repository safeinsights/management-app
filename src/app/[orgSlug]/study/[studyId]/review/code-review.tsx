import { AlertNotFound } from '@/components/errors'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { ReviewCriteriaBanner } from '@/components/study/review-criteria-banner'
import { Routes } from '@/lib/routes'
import { type Submitted } from '@/schema/study'
import { getStudyReviewForJob, jobScanResultForJob, latestJobForStudyOrNull } from '@/server/db/queries'
import { Box, Stack, Title } from '@mantine/core'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { CodeReviewClient } from './code-review-client'
import { CODE_REVIEW_BANNER_CRITERIA } from './code-review-criteria'
import { SubmittedCodeSection } from './submitted-code-section'

type CodeReviewProps = {
    orgSlug: string
    study: Submitted<SelectedStudy>
}

function CodeReviewStatusBanner({ labName }: { labName: string }) {
    return (
        <ReviewCriteriaBanner
            testId="code-review-status-banner"
            criteriaTestId="code-review-criteria"
            intro={
                <>
                    {labName} has submitted their study code for review. Below, you will review their code and an
                    AI-generated summary of its behavior, then share your feedback and decision. Consider evaluating the
                    code based on these criteria:
                </>
            }
            criteria={CODE_REVIEW_BANNER_CRITERIA}
        />
    )
}

type CodeReviewSectionProps = {
    study: Submitted<SelectedStudy>
    submittedAt: Date | string
}

function CodeReviewSection({ study, submittedAt }: CodeReviewSectionProps) {
    const labName = study.submittingLabName ?? study.submittedByOrgSlug

    return (
        <ProposalStepHeader
            stepLabel="STEP 3"
            heading="Review study code"
            studyTitle={study.title}
            timestampDate={submittedAt}
            banner={<CodeReviewStatusBanner labName={labName} />}
        />
    )
}

export async function CodeReview({ orgSlug, study }: CodeReviewProps) {
    const job = await latestJobForStudyOrNull(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const [review, scan] = await Promise.all([getStudyReviewForJob(job.id), jobScanResultForJob(job.id)])
    const proposalHref = `${Routes.studyReview({ orgSlug, studyId: study.id })}?from=code-review`
    const latestJobStatus = job.statusChanges.at(0)?.status ?? null

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
                <CodeReviewSection study={study} submittedAt={job.createdAt} />
                <SubmittedCodeSection orgSlug={orgSlug} study={study} job={job} review={review} scan={scan} />
                <CodeReviewClient orgSlug={orgSlug} study={study} job={job} latestJobStatus={latestJobStatus} />
            </Stack>
        </Box>
    )
}
