'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { ProposalReviewFeatureFlag } from '@/components/openstax-feature-flag'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { DatasetsField, LexicalProposalField, PIField, ResearcherField } from '@/components/study/proposal-fields'
import { stringifyJson } from '@/lib/string'
import { Routes } from '@/lib/routes'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { usePopover } from '@/hooks/use-popover'
import { ProposalReviewView } from './proposal-review-view'
import { ProposalReviewButtons } from './proposal-review-buttons'

type OldProposalReviewViewProps = {
    orgSlug: string
    study: SelectedStudy
    agreementsHref?: string
}

export function OldProposalReviewView({ orgSlug, study, agreementsHref }: OldProposalReviewViewProps) {
    const { getPopoverProps } = usePopover()

    const existingView = (
        <Stack px="xl" gap="xl">
            <PageBreadcrumbs
                crumbs={[['Dashboard', Routes.orgDashboard({ orgSlug })], ['Data use request / Review study proposal']]}
            />

            <Title order={2}>Review Study</Title>

            <Paper bg="white" p="xxl">
                <Stack gap="md">
                    <Text fz="xs" fw={700} c="gray.7">
                        STEP 1
                    </Text>
                    <Title order={4}>Review study proposal</Title>
                    <Divider />
                    <Text size="sm">You have a new data use request. You may review and approve or reject it.</Text>

                    <Group justify="space-between" align="flex-start" wrap="nowrap" mt="md">
                        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                            <Text fw={600} size="sm">
                                Study title
                            </Text>
                            <Text size="sm">{study.title}</Text>
                        </Stack>
                        <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
                    </Group>

                    <DatasetsField datasets={study.datasets ?? []} orgDataSources={study.orgDataSources} />
                    <LexicalProposalField
                        label="Research question(s)"
                        value={stringifyJson(study.researchQuestions)}
                        divider="default"
                    />
                    <LexicalProposalField label="Project summary" value={stringifyJson(study.projectSummary)} />
                    <LexicalProposalField label="Impact" value={stringifyJson(study.impact)} />
                    <LexicalProposalField
                        label="Additional notes or requests"
                        value={stringifyJson(study.additionalNotes)}
                    />
                    <PIField study={study} orgSlug={orgSlug} size="sm" {...getPopoverProps('pi')} />
                    <ResearcherField
                        study={study}
                        orgSlug={orgSlug}
                        size="sm"
                        {...getPopoverProps('researcher')}
                        mt="md"
                    />
                </Stack>
            </Paper>

            <ProposalReviewButtons study={study} orgSlug={orgSlug} agreementsHref={agreementsHref} />
        </Stack>
    )

    if (agreementsHref) {
        return existingView
    }

    return (
        <ProposalReviewFeatureFlag
            defaultContent={existingView}
            optInContent={<ProposalReviewView orgSlug={orgSlug} study={study} />}
        />
    )
}
