import { semanticColor } from '@/theme/tokens'
import type { ReactNode } from 'react'
import { Box, Stack } from '@mantine/core'
import type { StudyJobStatus } from '@/database/types'
import { ProposalStepHeader, REVIEW_OUTPUTS_STEP } from '@/components/study/proposal-step-header'
import { StepNavigation } from '@/components/study/step-navigation'
import type { StepNav } from '@/lib/study-screen'
import { OutputsStatusAlert } from './outputs-status-alert'

export type SecondaryAnalysisViewProps = {
    /** The page header, built by the screen from the study, so the h1 fallback lives in one place. */
    header: ReactNode
    stageStatus: StudyJobStatus
    stageStartedAt: string | Date
    nav: StepNav
}

export function SecondaryAnalysisView({ header, stageStatus, stageStartedAt, nav }: SecondaryAnalysisViewProps) {
    return (
        <Box bg={semanticColor('surface.page')}>
            <Stack px="xl" gap="xxl" py="xl">
                {header}
                <ProposalStepHeader
                    stepLabel={REVIEW_OUTPUTS_STEP.label}
                    heading={REVIEW_OUTPUTS_STEP.heading}
                    banner={<OutputsStatusAlert stageStatus={stageStatus} startedAt={stageStartedAt} />}
                />
                <StepNavigation nav={nav} />
            </Stack>
        </Box>
    )
}
