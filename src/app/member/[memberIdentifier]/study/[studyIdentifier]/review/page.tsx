'use server'

import { Divider, Grid, GridCol, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { MemberBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study-actions'
import React from 'react'
import { StudyReviewButtons } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/study-review-buttons'
import { StudyJobFiles } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/study-job-files'
import { StudyResults } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/study-results'
import { first, last } from 'remeda'
import { auth } from '@clerk/nextjs/server'
import { getMemberUserFingerprint } from '@/app/account/keys/user-key-actions'

export default async function StudyReviewPage(props: {
    params: Promise<{
        memberIdentifier: string
        studyIdentifier: string
    }>
}) {
    const { userId: clerkId } = await auth()
    const fingerprint = await getMemberUserFingerprint(clerkId)

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

    const latestJob = last(study.jobs)

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
                        <StudyReviewButtons study={study} memberIdentifier={memberIdentifier} />
                    </Group>
                    <Divider />
                    <Grid>
                        <GridCol span={3}>
                            <Stack>
                                <Text fw="bold">Study Name</Text>
                                <Text fw="bold">Principal investigator</Text>
                                <Text fw="bold">Researcher</Text>
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
                                <Text>{study.irbProtocols} some link</Text>
                                <Text>TODO agreements</Text>
                                <StudyJobFiles job={study.jobs[0]} />
                            </Stack>
                        </GridCol>
                    </Grid>
                </Stack>
            </Paper>
            {latestJob && <StudyResults latestJob={latestJob} fingerprint={fingerprint} />}
        </Stack>
    )
}
