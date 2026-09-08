import { Box, Stack } from '@mantine/core'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'
import { projectStudyState, resolveStepNav } from '@/lib/study-screen'
import { guardExecutionStage } from './execution-stage-guard'
import type { ScreenComponentProps } from './types'

const ProcessingBanner = ({ approvedAt }: { approvedAt: Date | string | null }) => (
    <StatusAlert
        variant={STATUS_ALERT_VARIANT.informative}
        title={statusAlertTitle('Outputs not ready, code processing started', approvedAt)}
    >
        Your code is running in the secure enclave. This can take a while, depending on how complex it is. We will let
        you know when your outputs are ready or if anything goes wrong.
    </StatusAlert>
)

export async function OutputsPendingScreen({
    study,
    raw,
    orgSlug,
    dashboardHref,
    returnTo,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'dashboardHref' | 'returnTo'>) {
    // allowNoStage: this screen is routed from CODE-APPROVED onward, before the enclave reports a stage.
    const result = await guardExecutionStage(study, {
        noJobMessage: 'This study has no submitted code yet.',
        allowNoStage: true,
    })
    if (!('job' in result)) return result

    const { job, stage } = result
    // Undated rather than "today" when neither row carries a timestamp, matching the other banners.
    const approvedAt =
        job.statusChanges.find((c) => c.status === 'CODE-APPROVED')?.createdAt ?? stage?.startedAt ?? null
    const nav = resolveStepNav('outputs-pending', projectStudyState(raw), {
        orgSlug,
        studyId: study.id,
        dashboardHref,
        returnTo,
    })

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                <ProposalStepHeader
                    stepLabel="STEP 4"
                    heading="Verify outputs"
                    studyTitle={study.title}
                    banner={<ProcessingBanner approvedAt={approvedAt} />}
                />
                <StepNavigation nav={nav} />
            </Stack>
        </Box>
    )
}
