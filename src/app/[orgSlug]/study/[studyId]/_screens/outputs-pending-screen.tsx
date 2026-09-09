import { Box, Stack } from '@mantine/core'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'
import { latestStatusAt } from '@/lib/study-job-status'
import { projectStudyState, resolveStepNav } from '@/lib/study-screen'
import { guardSubmittedJob } from './submitted-job-guard'
import type { ScreenComponentProps } from './types'

// Routed from CODE-APPROVED onward, so this also serves a run that already failed while the reviewer
// has yet to record a files decision. The error itself stays undisclosed until then (OTTER-598), but
// the copy must not claim the code is still running.
const bannerCopy = (runErrored: boolean) =>
    runErrored
        ? {
              title: 'Outputs not ready, awaiting review',
              message:
                  'Code processing has finished and is with the data partner for review. We will let you know when your outputs are ready or if anything needs your attention.',
          }
        : {
              title: 'Outputs not ready, code processing started',
              message:
                  'Your code is running in the secure enclave. This can take a while, depending on how complex it is. We will let you know when your outputs are ready or if anything goes wrong.',
          }

const ProcessingBanner = ({ runErrored, approvedAt }: { runErrored: boolean; approvedAt: Date | string | null }) => {
    const { title, message } = bannerCopy(runErrored)
    return (
        <StatusAlert variant={STATUS_ALERT_VARIANT.informative} title={statusAlertTitle(title, approvedAt)}>
            {message}
        </StatusAlert>
    )
}

export async function OutputsPendingScreen({
    study,
    raw,
    orgSlug,
    dashboardHref,
    returnTo,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'dashboardHref' | 'returnTo'>) {
    const result = await guardSubmittedJob(study, { noJobMessage: 'This study has no submitted code yet.' })
    if (!('job' in result)) return result

    // CODE-APPROVED is what routed us here, so it is the date the step opened.
    const approvedAt = latestStatusAt(result.job.statusChanges, 'CODE-APPROVED')
    const state = projectStudyState(raw)
    const nav = resolveStepNav('outputs-pending', state, {
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
                    banner={<ProcessingBanner runErrored={state.runErrored} approvedAt={approvedAt} />}
                />
                <StepNavigation nav={nav} />
            </Stack>
        </Box>
    )
}
