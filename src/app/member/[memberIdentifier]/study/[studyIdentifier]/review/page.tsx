import { Divider, Grid, GridCol, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { MemberBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study-actions'
import React from 'react'
import { ReviewControls } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/review-buttons'
import { StudyJobFiles } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/study-job-files'
import { StudyResults } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/study-results'
import { first } from 'remeda'

export default async function StudyReviewPage(props: {
    params: Promise<{
        memberIdentifier: string
        studyIdentifier: string
    }>
}) {
    const params = await props.params

    const { memberIdentifier, studyIdentifier } = params

    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const study = await getStudyAction(studyIdentifier)

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const latestJob = first(study.jobs)

    return (
        <Stack px="xl" gap="xl">
            <Stack mt="xl" gap="lg">
                <MemberBreadcrumbs
                    crumbs={{
                        memberIdentifier,
                        current: study.title,
                    }}
                />
                <Divider />
            </Stack>

            <Title>Study details</Title>

            <Paper bg="white" p="xl">
                <Stack>
                    <Group justify="space-between">
                        <Title order={4}>Study Proposal</Title>
                        <ReviewControls study={study} memberIdentifier={memberIdentifier} />
                    </Group>
                    <Divider />
                    <Grid>
                        <GridCol span={3}>
                            <Stack>
                                <Text fw="bold">Study Name</Text>
                                <Text fw="bold">Principal investigator</Text>
                                <Text fw="bold">Researcher</Text>
                                <Text fw="bold">Study Description</Text>
                                <Text fw="bold">IRB</Text>
                                <Text fw="bold">Agreement(s)</Text>
                                <Text fw="bold">Study Code</Text>
                            </Stack>
                        </GridCol>
                        <GridCol span={9}>
                            <Stack>
                                <Text>{study.title}</Text>
                                <Text>{study.piName}</Text>
                                <Text>{study.researcherName}</Text>
                                <Text>{study.description}</Text>
                                <Text>{study.irbProtocols} some link</Text>
                                <Text>TODO agreements</Text>
                                <StudyJobFiles jobId={study.jobs[0].id} />
                            </Stack>
                        </GridCol>
                    </Grid>
                </Stack>
            </Paper>
            {latestJob && <StudyResults latestJob={latestJob} />}
        </Stack>
    )
}
