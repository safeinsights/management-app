import dayjs from 'dayjs'
import { Box, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { AlertNotFound } from '@/components/errors'
import { ButtonLink } from '@/components/links'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import { SecurityKeyForm } from '@/components/study/security-key-form'
import { Routes } from '@/lib/routes'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import type { ScreenComponentProps } from './types'

// statusChanges arrive newest-first (see latestJobForStudyQuery ordering), so `find` picks the
// most recent RUN-COMPLETE — the moment the outputs became available for review.
function availableTimestamp(
    statusChanges: ReadonlyArray<{ status: string; createdAt: Date | string }>,
): Date | string | null {
    return statusChanges.find((c) => c.status === 'RUN-COMPLETE')?.createdAt ?? null
}

const AvailableBanner = ({ availableAt, labName }: { availableAt: Date | string; labName: string }) => (
    <StatusAlert
        variant={STATUS_ALERT_VARIANT.action}
        title={`Outputs are available for review \u2022 ${dayjs(availableAt).format('MMM DD, YYYY')}`}
    >
        Enter your security key to decrypt the outputs, review them, and then share with {labName}.
    </StatusAlert>
)

export async function ReviewerOutputsAvailableScreen({
    study,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'orgSlug'>) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const availableAt = availableTimestamp(job.statusChanges)
    if (!availableAt) {
        return (
            <AlertNotFound
                title="Outputs not found"
                message="This study does not have outputs available for review yet."
            />
        )
    }

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ProposalStepHeader
                    stepLabel="STEP 3"
                    heading="Review outputs"
                    studyTitle={study.title ?? ''}
                    banner={<AvailableBanner availableAt={availableAt} labName={study.submittingLabName} />}
                />

                <SecurityKeyForm job={job} />

                <Group>
                    <ButtonLink
                        href={Routes.studyReviewCode({ orgSlug, studyId: study.id })}
                        variant="subtle"
                        leftSection={<CaretLeftIcon />}
                    >
                        Previous step
                    </ButtonLink>
                </Group>
            </Stack>
        </Box>
    )
}
