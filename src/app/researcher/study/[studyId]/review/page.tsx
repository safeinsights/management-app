import { Paper, Stack, Title, Divider } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { checkUserAllowedStudyView, latestJobForStudy } from '@/server/db/queries'
import { ViewJobResultsCSV } from '@/components/view-job-results-csv'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import React from 'react'

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
            <Paper bg="white" p={40}>
                <Stack>
                    <Title order={4}>Study Details</Title>
                    <StudyDetails studyId={studyId} />
                </Stack>
            </Paper>

            <Paper bg="white" p={40}>
                <Stack>
                    <Title order={4}>Study Code</Title>
                    <Divider c="dimmed" />
                    <StudyCodeDetails job={job} />
                </Stack>
            </Paper>

            <Paper bg="white" p={40}>
                <Stack>
                    <Title order={4}>Study Results</Title>
                    <Divider c="dimmed" />
                    <ViewJobResultsCSV job={job} />
                </Stack>
            </Paper>
        </Stack>
    )
}
