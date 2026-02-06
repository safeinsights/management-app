'use client'

import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { ResearcherProfilePopover } from '@/components/researcher-profile-popover'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { ProposalReviewButtons } from './proposal-review-buttons'

type ProposalReviewViewProps = {
    orgSlug: string
    study: SelectedStudy
}

function ProposalField({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null

    return (
        <>
            <Divider />
            <Stack gap={4}>
                <Text fw="bold" size="sm">
                    {label}
                </Text>
                <Text size="sm">{value}</Text>
            </Stack>
        </>
    )
}

function DataSourcesField({ dataSources }: { dataSources: string[] }) {
    if (!dataSources.length) return null

    return (
        <>
            <Divider />
            <Stack gap={4}>
                <Text fw="bold" size="sm">
                    Dataset(s) of interest
                </Text>
                <Text size="sm">{dataSources.join(', ')}</Text>
            </Stack>
        </>
    )
}

function ResearcherField({ study, orgSlug }: { study: SelectedStudy; orgSlug: string }) {
    return (
        <>
            <Divider />
            <Stack gap={4}>
                <Text fw="bold" size="sm">
                    Researcher
                </Text>
                <ResearcherProfilePopover userId={study.researcherId} studyId={study.id} orgSlug={orgSlug}>
                    <Text size="sm" c="blue.7" td="underline" style={{ cursor: 'pointer', display: 'inline-block' }}>
                        {study.createdBy}
                    </Text>
                </ResearcherProfilePopover>
                <Link
                    href={Routes.researcherProfileView({ orgSlug, studyId: study.id })}
                    target="_blank"
                    size="xs"
                    c="blue.7"
                >
                    View full profile
                </Link>
            </Stack>
        </>
    )
}

export function ProposalReviewView({ orgSlug, study }: ProposalReviewViewProps) {
    return (
        <Stack px="xl" gap="xl">
            <OrgBreadcrumbs
                crumbs={{
                    orgSlug,
                    current: 'Study request',
                }}
            />

            <Stack gap="xs">
                <Text size="sm" c="dimmed" tt="uppercase" fw={600}>
                    Step 1
                </Text>
                <Title order={2} size="h4" fw={500}>
                    Review study proposal
                </Title>
                <Text size="sm" c="dimmed">
                    You have a new data use request. You may review and approve or reject it.
                </Text>
            </Stack>

            <Paper bg="white" p="xxl">
                <Stack gap="md">
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            {study.title}
                        </Title>
                        <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
                    </Group>

                    <DataSourcesField dataSources={study.dataSources} />
                    <ProposalField label="Research question(s)" value={study.researchQuestions} />
                    <ProposalField label="Project summary" value={study.projectSummary} />
                    <ProposalField label="Impact" value={study.impact} />
                    <ProposalField label="Additional notes" value={study.additionalNotes} />
                    <ProposalField label="Principal Investigator" value={study.piName} />
                    <ResearcherField study={study} orgSlug={orgSlug} />
                </Stack>
            </Paper>

            <ProposalReviewButtons study={study} orgSlug={orgSlug} />
        </Stack>
    )
}
