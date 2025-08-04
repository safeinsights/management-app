import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { allJobsForStudy } from '@/server/db/queries'
import { JobResults } from '@/components/job-results'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import React from 'react'
import StudyApprovalStatus from '@/components/study/study-approval-status'
import { CodeApprovalStatus, FileApprovalStatus } from '@/components/study/job-approval-status'
import { JobResultsStatusMessage } from '@/app/researcher/study/[studyId]/review/job-results-status-message'

export const dynamic = 'force-dynamic'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string }> }) {
    const { studyId } = await props.params

    // getStudyAction will check permissions
    const study = await getStudyAction({ studyId })

    // Ensure the study exists and user has permission to view it
    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const jobs = await allJobsForStudy(studyId)

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
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
                    <StudyDetails studyId={studyId} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Code
                        </Title>
                        <CodeApprovalStatus job={jobs[0]} />
                    </Group>
                    <Divider c="dimmed" />
                    <StudyCodeDetails jobs={jobs} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Status
                        </Title>
                        <FileApprovalStatus job={jobs[0]} />
                    </Group>
                    <Divider c="dimmed" />
                    <JobResultsStatusMessage job={jobs[0]} />
                    <JobResults jobs={jobs} />
                </Stack>
            </Paper>
        </Stack>
    )
}
