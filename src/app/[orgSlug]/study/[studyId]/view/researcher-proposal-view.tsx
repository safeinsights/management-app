'use client'

import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { DatasetsField, LexicalProposalField, PIField } from '@/components/study/proposal-fields'
import { stringifyJson } from '@/lib/string'
import { Routes } from '@/lib/routes'
import { Anchor, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'

type ResearcherProposalViewProps = {
    orgSlug: string
    study: SelectedStudy
    agreementsHref?: string
}

export function ResearcherProposalView({ orgSlug, study, agreementsHref }: ResearcherProposalViewProps) {
    return (
        <Stack px="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId: study.id,
                    orgSlug,
                    current: 'Study proposal',
                }}
            />

            <Title order={2}>Study request</Title>

            <Paper bg="white" p="xxl">
                <Stack gap="md">
                    <Text fz="xs" fw={700} c="gray.6">
                        STEP 2
                    </Text>
                    <Title order={4}>Study proposal</Title>
                    <Divider />

                    <Group justify="space-between" align="flex-start" mt="md">
                        <Stack gap={4}>
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
                    <PIField study={study} />
                    <ResearcherProfileLink study={study} />
                </Stack>
            </Paper>

            <ProceedButton href={agreementsHref} />
        </Stack>
    )
}

function ResearcherProfileLink({ study }: { study: SelectedStudy }) {
    return (
        <Stack gap={4} mt="md">
            <Text fw={600} size="sm">
                Researcher
            </Text>
            <Group align="center" gap="md">
                <Text size="sm">{study.createdBy}</Text>
                <Anchor
                    href={Routes.researcherProfile}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="sm"
                    c="blue.7"
                    fw={600}
                >
                    <Group gap={4} wrap="nowrap">
                        View profile
                        <ArrowSquareOutIcon size={16} weight="bold" />
                    </Group>
                </Anchor>
            </Group>
        </Stack>
    )
}

function ProceedButton({ href }: { href?: string }) {
    const router = useRouter()

    if (!href) return null

    return (
        <Group mt="xxl" justify="flex-end">
            <Button variant="primary" size="md" onClick={() => router.push(href as Route)}>
                Proceed to Step 3
            </Button>
        </Group>
    )
}
