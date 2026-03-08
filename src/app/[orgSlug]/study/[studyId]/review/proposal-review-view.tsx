'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { DatasetsField, LexicalProposalField, PIField, ResearcherField } from '@/components/study/proposal-fields'
import { stringifyJson } from '@/lib/string'
import { Routes } from '@/lib/routes'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { ProposalReviewButtons } from './proposal-review-buttons'

type ProposalReviewViewProps = {
    orgSlug: string
    study: SelectedStudy
}

export function ProposalReviewView({ orgSlug, study }: ProposalReviewViewProps) {
    return (
        <Stack px="xl" gap="xl">
            <PageBreadcrumbs
                crumbs={[['Dashboard', Routes.orgDashboard({ orgSlug })], ['Data use request / Review study proposal']]}
            />

            <Title order={2}>Study request</Title>

            <Paper bg="white" p="xxl">
                <Stack gap="md">
                    <Text fz="xs" fw={700} c="gray.6">
                        STEP 1
                    </Text>
                    <Title order={4}>Review study proposal</Title>
                    <Divider />
                    <Text size="sm">You have a new data use request. You may review and approve or reject it.</Text>

                    <Group justify="space-between" align="flex-start" mt="md">
                        <Stack gap={4}>
                            <Text fw={600} size="sm">
                                Study title
                            </Text>
                            <Text size="sm">{study.title}</Text>
                        </Stack>
                        <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
                    </Group>

                    <DatasetsField datasets={study.datasets ?? []} />
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
                    <PIField study={study} />
                    <ResearcherField study={study} orgSlug={orgSlug} mt="md" />
                </Stack>
            </Paper>

            <ProposalReviewButtons study={study} orgSlug={orgSlug} />
        </Stack>
    )
}
