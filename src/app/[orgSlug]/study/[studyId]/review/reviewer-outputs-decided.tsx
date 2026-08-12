import { Box, Divider, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { AlertNotFound } from '@/components/errors'
import { ButtonLink } from '@/components/links'
import { OutputsDecidedBanner } from '@/components/study/outputs-decided-banner'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

type ReviewerOutputsDecidedProps = {
    orgSlug: string
    study: SelectedStudy
}

export async function ReviewerOutputsDecided({ study, orgSlug }: ReviewerOutputsDecidedProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const statuses = new Set(job.statusChanges.map((c) => c.status))
    const filesDecision = job.statusChanges.find((c) => c.status === 'FILES-APPROVED' || c.status === 'FILES-REJECTED')
    if (!filesDecision) {
        return (
            <AlertNotFound
                title="No decision found"
                message="No outputs decision has been recorded for this study yet."
            />
        )
    }

    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const resultsErrored = statuses.has('JOB-ERRORED')
    const resultsApproved = statuses.has('FILES-APPROVED')

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="lg" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ProposalStepHeader
                    stepLabel="STEP 3"
                    heading="Review outputs"
                    studyTitle={study.title ?? ''}
                    banner={
                        <OutputsDecidedBanner
                            resultsErrored={resultsErrored}
                            resultsApproved={resultsApproved}
                            labName={labName}
                            decidedAt={filesDecision.createdAt}
                        />
                    }
                />
                <Divider color="charcoal.1" />
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
