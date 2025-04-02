import { Paper, Stack, Title, Divider } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { checkUserAllowedStudyView, latestJobForStudy } from '@/server/db/queries'
import { ViewCSV } from './results'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import React from 'react'

export default async function StudyReviewPage(props: { params: Promise<{ studyId: string }> }) {
    const { studyId } = await props.params
    await checkUserAllowedStudyView(studyId)

    const study = await getStudyAction(studyId)

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const job = await latestJobForStudy(studyId)

    return (
        <Stack>
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId,
                    studyTitle: study?.title,
                    current: 'Proposal Request',
                }}
            />

            <Paper bg="white" p="xl">
                <Stack>
                    <Title order={3}>Study Details</Title>
                    <StudyDetails studyIdentifier={studyId} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xl">
                <Stack>
                    <Title order={3}>Study Code</Title>
                    <Divider my="md" c="dimmed" />
                    {job && <StudyCodeDetails job={job} />}
                </Stack>
            </Paper>

            <Paper bg="white" p="xl">
                <Stack>
                    <Title order={3}>Study Results</Title>
                    <Divider my="md" c="dimmed" />
                    <ViewCSV job={job} />
                </Stack>
            </Paper>
        </Stack>
    )
}
