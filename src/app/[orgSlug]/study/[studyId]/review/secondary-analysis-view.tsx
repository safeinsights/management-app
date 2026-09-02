import type { ReactNode } from 'react'
import type { Route } from 'next'
import { Box, Group, Stack } from '@mantine/core'
import type { StudyJobStatus } from '@/database/types'
import { ButtonLink } from '@/components/links'
import { PreviousStepLink } from '@/components/study/previous-step-link'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { OutputsStatusAlert } from './outputs-status-alert'

export type SecondaryAnalysisViewProps = {
    studyTitle: string | null
    /** The page header, built by the screen from the study, so the h1 fallback lives in one place. */
    header: ReactNode
    stageStatus: StudyJobStatus
    stageStartedAt: string | Date
    previousHref: Route
    dashboardHref: Route
}

export function SecondaryAnalysisView({
    studyTitle,
    header,
    stageStatus,
    stageStartedAt,
    previousHref,
    dashboardHref,
}: SecondaryAnalysisViewProps) {
    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                {header}
                <ProposalStepHeader
                    stepLabel="STEP 3"
                    heading="Review outputs"
                    studyTitle={studyTitle}
                    banner={<OutputsStatusAlert stageStatus={stageStatus} startedAt={stageStartedAt} />}
                />
                <Group justify="space-between">
                    <PreviousStepLink previousHref={previousHref} />
                    <ButtonLink href={dashboardHref} size="md">
                        Back to my studies
                    </ButtonLink>
                </Group>
            </Stack>
        </Box>
    )
}
