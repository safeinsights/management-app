import type { Route } from 'next'
import { Box, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { isSubmittedStudy } from '@/schema/study'
import { AlertNotFound } from '@/components/errors'
import { ButtonLink } from '@/components/links'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, STATUS_ALERT_SEPARATOR, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import { Routes } from '@/lib/routes'
import { currentExecutionStage } from '@/lib/study-job-status'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import type { ScreenComponentProps } from './types'

const ProcessingBanner = ({ approvedAt }: { approvedAt: Date | string }) => (
    <StatusAlert
        variant={STATUS_ALERT_VARIANT.informative}
        title={`Outputs not ready, code processing started ${STATUS_ALERT_SEPARATOR} ${dayjs(approvedAt).format('MMM DD, YYYY')}`}
    >
        Your code is running in the secure enclave. This can take a while, depending on how complex it is. We will let
        you know when your outputs are ready or if anything goes wrong.
    </StatusAlert>
)

export async function OutputsPendingScreen({
    study,
    orgSlug,
    dashboardHref,
    returnTo,
}: Pick<ScreenComponentProps, 'study' | 'orgSlug' | 'dashboardHref' | 'returnTo'>) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const stage = currentExecutionStage(job.statusChanges)
    if (!stage) {
        return (
            <AlertNotFound
                title="Outputs not yet available"
                message="Code has been approved but execution has not started yet. Please check back shortly."
            />
        )
    }

    const approvedAt = job.statusChanges.find((c) => c.status === 'CODE-APPROVED')?.createdAt ?? stage.startedAt
    const previousHref = Routes.studyViewCode({ orgSlug, studyId: study.id, returnTo }) as Route

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ProposalStepHeader
                    stepLabel="STEP 4"
                    heading="Verify outputs"
                    studyTitle={study.title}
                    banner={<ProcessingBanner approvedAt={approvedAt} />}
                />
                <Group justify="space-between">
                    <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                        Previous step
                    </ButtonLink>
                    <ButtonLink href={dashboardHref as Route} variant="filled" size="md">
                        Back to my studies
                    </ButtonLink>
                </Group>
            </Stack>
        </Box>
    )
}
