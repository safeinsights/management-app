import type { Route } from 'next'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StepNavigation } from '@/components/study/step-navigation'
import { projectStudyState, resolveStepNav } from '@/lib/study-screen'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { StudyDetails } from '@/components/study/study-details'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { ScreenComponentProps } from './types'

// study-overview: the generic Study Details layout — a draft-no-job study, or any unmapped state.
export function StudyOverviewScreen({ study, raw, orgSlug, dashboardHref, returnTo }: ScreenComponentProps) {
    const nav = resolveStepNav('study-overview', projectStudyState(raw), {
        orgSlug,
        studyId: study.id,
        dashboardHref: dashboardHref as Route,
        returnTo,
    })

    return (
        <Stack p="xl" gap="xxl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId: study.id,
                    orgSlug,
                    current: 'Study Details',
                    dashboardHref,
                }}
            />
            <StudyPageHeader>Study Details</StudyPageHeader>
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Title order={2} size="xl" style={{ flex: 1, minWidth: 0 }}>
                            Study Proposal
                        </Title>
                        <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
                    </Group>
                    <StudyDetails study={study} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={2} size="xl">
                            Study Code
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    <Text c="dimmed">No code has been uploaded yet.</Text>
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={2} size="xl">
                            Study Status
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    <Text c="dimmed">Status will be available after code is uploaded.</Text>
                </Stack>
            </Paper>

            <StepNavigation nav={nav} />
        </Stack>
    )
}
