import { Paper, Stack, Title, Divider, Group, Text } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { checkUserAllowedStudyView, latestJobForStudy } from '@/server/db/queries'
import { ViewJobResultsCSV } from '@/components/view-job-results-csv'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import React from 'react'
import StudyStatusDisplay from '@/components/study/study-status-display'
import JobStatusDisplay from '@/components/study/job-status-display'
import type { StudyJobStatus } from '@/database/types'

export const dynamic = 'force-dynamic'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string }> }) {
    const { studyId } = await props.params

    await checkUserAllowedStudyView(studyId)

    const study = await getStudyAction(studyId)

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const job = await latestJobForStudy(studyId)

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
                        <StudyStatusDisplay status={study.status} date={study.approvedAt ?? study.rejectedAt} />
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
                        <JobStatusDisplay
                            status={job?.codeStatus as StudyJobStatus | undefined}
                            date={job?.codeStatusOccurredAt}
                        />
                    </Group>
                    <Divider c="dimmed" />
                    <StudyCodeDetails job={job} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Results
                        </Title>
                        <JobStatusDisplay
                            status={job?.resultsStatus as StudyJobStatus | undefined}
                            date={job?.resultsStatusOccurredAt}
                        />
                    </Group>
                    <Divider c="dimmed" />
                    {job?.resultsPath ? (
                        <ViewJobResultsCSV job={job} />
                    ) : (
                        <Text size="md">Study results will be displayed after the data organization reviews them.</Text>
                    )}
                </Stack>
            </Paper>
        </Stack>
    )
}
