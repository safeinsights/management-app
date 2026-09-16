import { Box, Stack } from '@mantine/core'
import { DatedStatusBanner } from '@/components/study/dated-status-banner'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { latestStatusAt } from '@/lib/study-job-status'
import { researcherOutputsPendingBanner } from '@/lib/study-banners'
import { projectStudyState } from '@/lib/study-screen'
import { guardSubmittedJob } from './submitted-job-guard'
import type { ScreenComponentProps } from './types'

export async function OutputsPendingScreen({ study, raw, nav }: Pick<ScreenComponentProps, 'study' | 'raw' | 'nav'>) {
    const result = await guardSubmittedJob(study, { noJobMessage: 'This study has no submitted code yet.' })
    if (!('job' in result)) return result

    // CODE-APPROVED is what routed us here, so it is the date the step opened.
    const approvedAt = latestStatusAt(result.job.statusChanges, 'CODE-APPROVED')
    const banner = researcherOutputsPendingBanner({ runErrored: projectStudyState(raw).runErrored })

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                <ProposalStepHeader
                    stepLabel="STEP 4"
                    heading="Verify outputs"
                    banner={<DatedStatusBanner copy={banner} at={approvedAt} />}
                />
                <StepNavigation nav={nav} />
            </Stack>
        </Box>
    )
}
