import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { ReviewCriteriaBanner } from '@/components/study/review-criteria-banner'
import { Routes } from '@/lib/routes'
import { latestJobForStudy } from '@/server/db/queries'
import { Box, Stack, Title } from '@mantine/core'
import type { SelectedStudy } from '@/server/actions/study.actions'

type CodeReviewRedesignViewProps = {
    orgSlug: string
    study: SelectedStudy
}

const CODE_REVIEW_CRITERIA = [
    {
        label: 'Proposal alignment',
        description: 'Does the code align with the approved research proposal?',
    },
    {
        label: 'Agreement compliance',
        description: 'Does the code comply with all the agreements?',
    },
    {
        label: 'Security checks',
        description: 'Have security and vulnerability checks been passed?',
    },
    {
        label: 'Privacy protection',
        description: 'Is there any risk of PII exposure expected in the outputs?',
    },
]

function CodeReviewStatusBanner({ labName }: { labName: string }) {
    return (
        <ReviewCriteriaBanner
            testId="code-review-status-banner"
            criteriaTestId="code-review-criteria"
            intro={
                <>
                    <strong>{labName}</strong> has submitted their study code for review. Below, you will review their
                    code and an AI-generated summary of its behavior, then share your feedback and decision.
                </>
            }
            criteria={CODE_REVIEW_CRITERIA}
        />
    )
}

type CodeReviewSectionProps = {
    study: SelectedStudy
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

export async function CodeReviewRedesignView({ orgSlug, study }: CodeReviewRedesignViewProps) {
    const job = await latestJobForStudy(study.id)
    const proposalHref = `${Routes.studyReview({ orgSlug, studyId: study.id })}?from=code-review`

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
            </Stack>
        </Box>
    )
}
