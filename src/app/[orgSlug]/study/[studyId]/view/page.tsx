import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { latestJobForStudyOrNull } from '@/server/db/queries'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { actionResult } from '@/lib/utils'
import { CodeOnlyView } from './code-only-view'
import { StudyViewTracker } from '@/components/study/study-view-tracker'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const study = actionResult(await getStudyAction({ studyId }))

    const job = await latestJobForStudyOrNull(studyId)

    if (job) {
        return (
            <>
                <StudyViewTracker studyId={studyId} />
                <CodeOnlyView orgSlug={orgSlug} study={study} job={job} />
            </>
        )
    }

    return (
        <Stack p="xl" gap="xl">
            <StudyViewTracker studyId={studyId} />
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
                    orgSlug,
                    current: 'Study Details',
                }}
            />
            <Title order={1}>Study Details</Title>
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
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
