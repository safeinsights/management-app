import type { Route } from 'next'
import { Box, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import type { StudyJobStatus } from '@/database/types'
import { ButtonLink } from '@/components/links'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { OutputsStatusAlert } from './outputs-status-alert'

export type SecondaryAnalysisViewProps = {
    studyTitle: string
    stageStatus: StudyJobStatus
    stageStartedAt: string | Date
    previousHref: Route
    dashboardHref: Route
}

export function SecondaryAnalysisView({
    studyTitle,
    stageStatus,
    stageStartedAt,
    previousHref,
    dashboardHref,
}: SecondaryAnalysisViewProps) {
    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader>Secondary analysis study</StudyPageHeader>
                <ProposalStepHeader
                    stepLabel="STEP 3"
                    heading="Review outputs"
                    studyTitle={studyTitle}
                    banner={<OutputsStatusAlert stageStatus={stageStatus} startedAt={stageStartedAt} />}
                />
                <Group justify="space-between">
                    <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                        Previous step
                    </ButtonLink>
                    <ButtonLink href={dashboardHref} size="md">
                        Back to my studies
                    </ButtonLink>
                </Group>
            </Stack>
        </Box>
    )
}
