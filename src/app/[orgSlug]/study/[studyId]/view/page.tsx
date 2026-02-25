import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { latestJobForStudyOrNull } from '@/server/db/queries'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { ApprovalStatus } from '@/components/study/job-approval-status'
import { JobResultsStatusMessage } from './job-results-status-message'
import { actionResult } from '@/lib/utils'
import { extractJobStatus } from '@/hooks/use-job-results-status'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { CodeOnlyView } from './code-only-view'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    // getStudyAction will check permissions
    const study = actionResult(await getStudyAction({ studyId }))

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const job = await latestJobForStudyOrNull(studyId)

    const { isApproved, isErrored, isRejected } = job
        ? extractJobStatus(job.statusChanges)
        : { isApproved: false, isErrored: false, isRejected: false }

    const isStatusFocused = (isApproved && isErrored) || isRejected || isApproved
    const opacity = isStatusFocused ? 0.6 : 1

    const defaultContent = (
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
                        {job && !isStatusFocused && <ApprovalStatus job={job} orgSlug={study.orgSlug} type="code" />}
                    </Group>
                    <Divider c="dimmed" />
                    {job ? <StudyCodeDetails job={job} /> : <Text c="dimmed">No code has been uploaded yet.</Text>}
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Status
                        </Title>
                        {job && !isErrored && <ApprovalStatus job={job} orgSlug={study.orgSlug} type="files" />}
                    </Group>
                    <Divider c="dimmed" />
                    {job ? (
                        <JobResultsStatusMessage job={job} files={job.files} submittingOrgSlug={orgSlug} />
                    ) : (
                        <Text c="dimmed">Status will be available after code is uploaded.</Text>
                    )}
                </Stack>
            </Paper>
        </Stack>
    )

    const optInContent = job ? <CodeOnlyView orgSlug={orgSlug} study={study} job={job} /> : defaultContent

    return <OpenStaxFeatureFlag defaultContent={defaultContent} optInContent={optInContent} />
}
