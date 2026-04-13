import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { latestJobForStudyOrNull } from '@/server/db/queries'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { CodeOnlyView } from './code-only-view'
import { ResearcherProposalView } from './researcher-proposal-view'

export default async function StudyReviewPage(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { studyId, orgSlug } = await props.params
    const searchParams = await props.searchParams

    const study = actionResult(await getStudyAction({ studyId }))

    const job = await latestJobForStudyOrNull(studyId)

    const dashboardHref = searchParams.returnTo === 'org' ? Routes.orgDashboard({ orgSlug }) : Routes.dashboard

    if (job) return <CodeOnlyView orgSlug={orgSlug} study={study} job={job} dashboardHref={dashboardHref} />

    const showProposalView = study.status === 'REJECTED' || study.status === 'APPROVED'
    if (showProposalView) {
        const agreementsHref =
            searchParams.from === 'agreements' ? Routes.studyAgreements({ orgSlug, studyId }) : undefined
        return (
            <ResearcherProposalView
                orgSlug={orgSlug}
                study={study}
                agreementsHref={agreementsHref}
                dashboardHref={dashboardHref}
            />
        )
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
                    orgSlug,
                    current: 'Study Details',
                    dashboardHref,
                }}
            />
            <Title order={1}>Study Details</Title>
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Title order={4} size="xl" style={{ flex: 1, minWidth: 0 }}>
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
                        <Title order={4} size="xl">
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
                        <Title order={4} size="xl">
                            Study Status
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    <Text c="dimmed">Status will be available after code is uploaded.</Text>
                </Stack>
            </Paper>
        </Stack>
    )
}
