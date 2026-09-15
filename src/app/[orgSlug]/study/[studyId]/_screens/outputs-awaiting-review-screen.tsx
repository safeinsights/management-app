import { Box, Stack } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { displayOrgName } from '@/lib/string'
import { researcherOutputsAwaitingReviewBanner, type BannerCopy } from '@/lib/study-banners'
import { datedStatusChanges, latestStatusAt } from '@/lib/study-job-status'
import { isAwaitingOutputsReviewOutcome, projectStudyState } from '@/lib/study-screen'
import { guardSubmittedJob } from './submitted-job-guard'
import type { ScreenComponentProps } from './types'

const AwaitingReviewBanner = ({ copy, completedAt }: { copy: BannerCopy; completedAt: Date | string | null }) => (
    <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, completedAt)}>
        {copy.body}
    </StatusAlert>
)

export async function OutputsAwaitingReviewScreen({
    study,
    raw,
    nav,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'nav'>) {
    // Re-checked here so rendering cannot disagree with the rule table.
    if (!isAwaitingOutputsReviewOutcome(projectStudyState(raw))) {
        return <AlertNotFound title="Outputs not found" message="This study has no outputs under review." />
    }

    const result = await guardSubmittedJob(study, { noJobMessage: 'This study has no submitted code yet.' })
    if (!('job' in result)) return result

    // RUN-COMPLETE is what routed us here, so it dates both the finished run and the review window.
    const completedAt = latestStatusAt(datedStatusChanges(result.job.statusChanges), 'RUN-COMPLETE')
    const copy = researcherOutputsAwaitingReviewBanner({ dataPartner: displayOrgName(study.orgName) })

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                <ProposalStepHeader
                    stepLabel="STEP 4"
                    heading="Verify outputs"
                    banner={<AwaitingReviewBanner copy={copy} completedAt={completedAt} />}
                />
                <StepNavigation nav={nav} />
            </Stack>
        </Box>
    )
}
