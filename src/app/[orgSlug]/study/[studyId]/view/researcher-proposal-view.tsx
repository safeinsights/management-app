'use client'

import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { DatasetsField, LexicalProposalField, PIField, ResearcherField } from '@/components/study/proposal-fields'
import { usePopover } from '@/hooks/use-popover'
import { stringifyJson } from '@/lib/string'
import { Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { useEditAndResubmitProposalFeatureFlag } from '@/components/openstax-feature-flag'

type ResearcherProposalViewProps = {
    orgSlug: string
    study: SelectedStudy
    agreementsHref?: string
    dashboardHref?: string
}

export function ResearcherProposalView({ orgSlug, study, agreementsHref, dashboardHref }: ResearcherProposalViewProps) {
    const { getPopoverProps } = usePopover()

    return (
        <Stack px="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId: study.id,
                    orgSlug,
                    current: 'Study proposal',
                    dashboardHref,
                }}
            />

            <Title order={2}>Study request</Title>

            <Paper bg="white" p="xxl">
                <Stack gap="md">
                    <Text fz="xs" fw={700} c="gray.7">
                        STEP 2
                    </Text>
                    <Title order={4}>Study proposal</Title>
                    <Divider />

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

            <EditAndResubmitButton orgSlug={orgSlug} study={study} />
            <ProceedButton href={agreementsHref} />
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

function EditAndResubmitButton({ orgSlug, study }: { orgSlug: string; study: SelectedStudy }) {
    const router = useRouter()
    const isFlagOn = useEditAndResubmitProposalFeatureFlag()

    if (!isFlagOn || study.status !== 'CHANGE-REQUESTED') return null

    return (
        <Group mt="xxl" justify="flex-end">
            <Button
                variant="primary"
                size="md"
                onClick={() => router.push(Routes.studyEditAndResubmit({ orgSlug, studyId: study.id }))}
            >
                Edit and resubmit
            </Button>
        </Group>
    )
}
