import type { Route } from 'next'
import { Box, Group, Stack } from '@mantine/core'
import type { StudyJobStatus } from '@/database/types'
import { ButtonLink } from '@/components/links'
import { PreviousStepLink } from '@/components/study/previous-step-link'
import { PageHeader } from '@/components/page-header'
import { displayOrgName } from '@/lib/string'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { OutputsStatusAlert } from './outputs-status-alert'

export type SecondaryAnalysisViewProps = {
    studyTitle: string
    labName: string
    stageStatus: StudyJobStatus
    stageStartedAt: string | Date
    previousHref: Route
    dashboardHref: Route
}

export function SecondaryAnalysisView({
    studyTitle,
    labName,
    stageStatus,
    stageStartedAt,
    previousHref,
    dashboardHref,
}: SecondaryAnalysisViewProps) {
    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <PageHeader eyebrow={displayOrgName(labName)} title={studyTitle} />
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
