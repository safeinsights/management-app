import { Paper, Stack, Title, Divider, Group, Text } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { checkUserAllowedStudyView, latestJobForStudy } from '@/server/db/queries'
import { ViewJobResultsCSV } from '@/components/view-job-results-csv'
import { StudyDetails } from '@/components/study/study-details'
import { getStudyAction } from '@/server/actions/study.actions'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import React from 'react'
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'

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
                            Study Details
                        </Title>
                        {study.status === 'APPROVED' && study.approvedAt && (
                            <Group c="green.9" gap="0.5rem" align="center">
                                <CheckCircle weight="fill" size={24} />
                                <Text fz="xs" fw={600} c="green.9">
                                    Approved on {dayjs(study.approvedAt).format('MMM DD, YYYY')}
                                </Text>
                            </Group>
                        )}
                        {study.status === 'REJECTED' && study.rejectedAt && (
                            <Group c="red.9" gap="0.5rem" align="center">
                                <XCircle weight="fill" size={24} />
                                <Text fz="xs" fw={600} c="red.9">
                                    Rejected on {dayjs(study.rejectedAt).format('MMM DD, YYYY')}
                                </Text>
                            </Group>
                        )}
                    </Group>
                    <StudyDetails studyId={studyId} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Title order={4} size="xl">
                        Study Code
                    </Title>
                    <Divider c="dimmed" />
                    <StudyCodeDetails job={job} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Title order={4} size="xl">
                        Study Results
                    </Title>
                    <Divider c="dimmed" />
                    <ViewJobResultsCSV job={job} />
                </Stack>
            </Paper>
        </Stack>
    )
}
