'use server'

import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromSlugAction } from '@/server/actions/member.actions'
import { MemberBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study.actions'
import React from 'react'
import { StudyReviewButtons } from './study-review-buttons'
import { StudyDetails } from '@/components/study/study-details'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { StudyResults } from './study-results'
import { jobStatusForJobAction, latestJobForStudyAction } from '@/server/actions/study-job.actions'
import { getMemberUserFingerprintAction } from '@/server/actions/user-keys.actions'

export default async function StudyReviewPage(props: {
    params: Promise<{
        memberSlug: string
        studyIdentifier: string
    }>
}) {
    const fingerprint = await getMemberUserFingerprintAction()

    const params = await props.params

    const { memberSlug, studyIdentifier } = params

    const member = await getMemberFromSlugAction(memberSlug)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const study = await getStudyAction(studyIdentifier)

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    // FIXME: why aren't we combining these two into a single query
    const latestJob = await latestJobForStudyAction(study.id)
    const latestJobStatus = await jobStatusForJobAction(latestJob?.id)

    return (
        <Stack px="xl" gap="xl">
            <Stack mt="xl" gap="lg">
                <MemberBreadcrumbs
                    crumbs={{
                        memberSlug: memberSlug,
                        current: 'Study Details',
                    }}
                />
                <Divider />
            </Stack>

            <Title>Study details</Title>
            <Paper bg="white" p="xl">
                <Stack>
                    <Group justify="space-between">
                        <Title order={3}>Study Proposal</Title>
                        <StudyReviewButtons study={study} memberSlug={memberSlug} />
                    </Group>
                    <Stack mt="md">{studyIdentifier && <StudyDetails studyIdentifier={study.id} />}</Stack>
                </Stack>
            </Paper>

            <Paper bg="white" p="xl">
                <Stack mt="md">
                    <Title order={3}>Study Code</Title>
                    <Divider my="md" c="dimmed" />
                    <StudyCodeDetails job={latestJob} />
                </Stack>
            </Paper>

            <Paper bg="white" p="xl">
                <Stack mt="md">
                    <Title order={3}>Study Results</Title>
                    <Divider />
                    <StudyResults latestJob={latestJob} fingerprint={fingerprint} jobStatus={latestJobStatus} />
                </Stack>
            </Paper>
        </Stack>
    )
}
