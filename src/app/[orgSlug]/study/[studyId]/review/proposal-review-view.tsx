'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { ResearcherProfilePopover } from '@/components/researcher-profile-popover'

import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import { Routes } from '@/lib/routes'
import { Info } from '@phosphor-icons/react'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { ProposalReviewButtons } from './proposal-review-buttons'

type ProposalReviewViewProps = {
    orgSlug: string
    study: SelectedStudy
}

function LexicalProposalField({
    label,
    value,
    subtle = true,
}: {
    label: string
    value?: string | null
    subtle?: boolean
}) {
    if (!value) return null

    return (
        <>
            <Divider color={subtle ? 'gray.1' : undefined} />
            <Stack gap={4}>
                <Text fw={600} size="sm">
                    {label}
                </Text>
                <Text size="sm" component="div">
                    <ReadOnlyLexicalContent value={value} />
                </Text>
            </Stack>
        </>
    )
}

function DataSourcesField({ dataSources }: { dataSources: string[] }) {
    if (!dataSources.length) return null

    return (
        <Stack gap={4}>
            <Text fw={600} size="sm">
                Dataset(s) of interest
            </Text>
            <Text size="sm">{dataSources.join(', ')}</Text>
        </Stack>
    )
}

// TODO: Show info icon + hover popover when PI profile system is implemented
// TODO: Click info icon to open PI profile page
function PIField({ study }: { study: SelectedStudy }) {
    if (!study.piName) return null

    return (
        <>
            <Divider />
            <Stack gap={4}>
                <Text fw={600} size="sm">
                    Principal Investigator
                </Text>
                <Text size="sm">{study.piName}</Text>
            </Stack>
        </>
    )
}

function ResearcherField({ study, orgSlug, mt }: { study: SelectedStudy; orgSlug: string; mt?: string }) {
    return (
        <Stack gap={4} mt={mt}>
            <Text fw={600} size="sm">
                Researcher
            </Text>
            <ResearcherProfilePopover
                userId={study.researcherId}
                studyId={study.id}
                orgSlug={orgSlug}
                position="right"
                offset={10}
            >
                <Group gap={6} w="fit-content" style={{ cursor: 'pointer' }}>
                    <Text size="sm">{study.createdBy}</Text>
                    <Info weight="fill" size={16} color="gray" />
                </Group>
            </ResearcherProfilePopover>
        </Stack>
    )
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

                    <DataSourcesField dataSources={study.dataSources} />
                    <LexicalProposalField label="Research question(s)" value={study.researchQuestions} subtle={false} />
                    <LexicalProposalField label="Project summary" value={study.projectSummary} />
                    <LexicalProposalField label="Impact" value={study.impact} />
                    <LexicalProposalField label="Additional notes" value={study.additionalNotes} />
                    <PIField study={study} />
                    <ResearcherField study={study} orgSlug={orgSlug} mt="md" />
                </Stack>
            </Paper>

            <ProposalReviewButtons study={study} orgSlug={orgSlug} />
        </Stack>
    )
}
