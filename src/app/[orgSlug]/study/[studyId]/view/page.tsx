import { AlertNotFound } from '@/components/errors'
import { JobResults } from '@/components/job-results'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { CodeApprovalStatus, FileApprovalStatus } from '@/components/study/job-approval-status'
import { OpenWorkspaceButton } from '@/components/study/open-workspace-button'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { StudyDetails } from '@/components/study/study-details'
import { isActionError } from '@/lib/errors'
import { checkWorkspaceExists } from '@/server/actions/coder.actions'
import { getStudyAction } from '@/server/actions/study.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { currentUser } from '@clerk/nextjs/server'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { JobResultsStatusMessage } from './job-results-status-message'

export const dynamic = 'force-dynamic'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId } = await props.params

    // getStudyAction will check permissions
    const study = await getStudyAction({ studyId })
    const user = await currentUser()
    if (!study || isActionError(study)) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }
    let workspaceAlreadyExists = false

    const job = await latestJobForStudy(studyId)
    const email = user?.primaryEmailAddress?.emailAddress ?? ''
    const userId = study.researcherId
    let name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`
    if (name.length === 0) {
        name = study.researcherId
    }

    const workspaceData = await checkWorkspaceExists({
        email,
        userId,
        studyId,
    })
    if (!isActionError(workspaceData)) workspaceAlreadyExists = workspaceData.exists

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
                    orgSlug: study.orgSlug,
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
                        {!isActionError(study) && (
                            <StudyApprovalStatus status={study.status} date={study.approvedAt ?? study.rejectedAt} />
                        )}
                    </Group>
                    <StudyDetails studyId={studyId} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Code
                        </Title>
                        <Group>
                            <CodeApprovalStatus job={job} orgSlug={study.orgSlug} />
                            <OpenWorkspaceButton
                                name={name}
                                email={email}
                                userId={study.researcherId}
                                studyId={studyId}
                                alreadyExists={workspaceAlreadyExists}
                            />
                        </Group>
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
                        <FileApprovalStatus job={job} orgSlug={study.orgSlug} />
                    </Group>
                    <Divider c="dimmed" />
                    <JobResultsStatusMessage job={job} orgSlug={study.orgSlug} />
                    <JobResults job={job} />
                </Stack>
            </Paper>
        </Stack>
    )
}
