import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { latestJobForStudy } from '@/server/db/queries'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { ApprovalStatus } from '@/components/study/job-approval-status'
import { JobResultsStatusMessage } from './job-results-status-message'
import { actionResult } from '@/lib/utils'
import { extractJobStatus } from '@/hooks/use-job-results-status'
import { StudyCodeDetails } from '@/components/study/study-code-details'

export const dynamic = 'force-dynamic'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    // getStudyAction will check permissions
    const study = actionResult(await getStudyAction({ studyId }))

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const job = await latestJobForStudy(studyId)

    const { isApproved, isErrored, isRejected } = extractJobStatus(job.statusChanges)

    const isStatusFocused = (isApproved && isErrored) || isRejected || isApproved
    const opacity = isStatusFocused ? 0.6 : 1

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
                    orgSlug,
                    current: 'Study Details',
                }}
            />
            <Title order={1}>Study Details</Title>
            <Paper bg="white" p="xxl" opacity={opacity}>
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Proposal
                        </Title>
                        {!isStatusFocused && (
                            <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
                        )}
                    </Group>
                    <StudyDetails studyId={study.id} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl" opacity={opacity}>
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Code
                        </Title>

                        {!isStatusFocused && <ApprovalStatus job={job} orgSlug={study.orgSlug} type="code" />}
                    </Group>
                    <Divider c="dimmed" />
                    <StudyCodeDetails job={job} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Status
                        </Title>
                        {!isErrored && <ApprovalStatus job={job} orgSlug={study.orgSlug} type="files" />}
                    </Group>
                    <Divider c="dimmed" />
                    <JobResultsStatusMessage job={job} files={job.files} />
                </Stack>
            </Paper>
        </Stack>
    )
}
