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

function erroredTimestamp(
    statusChanges: ReadonlyArray<{ status: string; createdAt: Date | string }>,
): Date | string | null {
    return statusChanges.find((c) => c.status === 'JOB-ERRORED')?.createdAt ?? null
}

const ErroredBanner = ({ erroredAt }: { erroredAt: Date | string }) => (
    <StatusAlert
        variant={STATUS_ALERT_VARIANT.action}
        title={`Code errored \u2022 ${dayjs(erroredAt).format('MMM DD, YYYY')}`}
    >
        Enter your security key below to access the outputs and see what went wrong.
    </StatusAlert>
)

export async function ReviewerOutputsErroredScreen({
    study,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'orgSlug'>) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const erroredAt = erroredTimestamp(job.statusChanges)
    if (!erroredAt) {
        return <AlertNotFound title="No error found" message="This study has not encountered an error." />
    }

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ProposalStepHeader
                    stepLabel="STEP 3"
                    heading="Review outputs"
                    studyTitle={study.title ?? ''}
                    banner={<ErroredBanner erroredAt={erroredAt} />}
                />

                <SecurityKeyForm />

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
