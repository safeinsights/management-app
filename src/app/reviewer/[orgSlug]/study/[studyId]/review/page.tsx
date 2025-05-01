'use server'

import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study.actions'
import React from 'react'
import { StudyReviewButtons } from './study-review-buttons'
import { StudyDetails } from '@/components/study/study-details'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { StudyResults } from './study-results'
import { latestJobForStudyAction } from '@/server/actions/study-job.actions'
import { getReviewerFingerprintAction } from '@/server/actions/user-keys.actions'

export default async function StudyReviewPage(props: {
    params: Promise<{
        orgSlug: string
        studyId: string
    }>
}) {
    const fingerprint = await getReviewerFingerprintAction()

    const params = await props.params

    const { orgSlug, studyId } = params

    const org = await getOrgFromSlugAction(orgSlug)
    if (!org) {
        return <AlertNotFound title="Org was not found" message="no such org exists" />
    }

    const study = await getStudyAction(studyId)

    if (!study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const latestJob = await latestJobForStudyAction(study.id)

    return (
        <Stack px="xl" gap="xl">
            <Stack mt="xl" gap="lg">
                <OrgBreadcrumbs
                    crumbs={{
                        orgSlug: orgSlug,
                        current: 'Study Details',
                    }}
                />
            </Stack>

            <Title>Study details</Title>
            <Paper bg="white" p="xl">
                <Stack>
                    <Group justify="space-between">
                        <Title order={3}>Study Proposal</Title>
                        <StudyReviewButtons study={study} />
                    </Group>
                    <Stack mt="md">{studyId && <StudyDetails studyId={study.id} />}</Stack>
                </Stack>
            </Paper>

            <Paper bg="white" p="xl">
                <Stack mt="md">
                    <Title order={3}>Study Code</Title>
                    <Divider my="md" c="dimmed" />
                    <StudyCodeDetails job={latestJob} />
                </Stack>
            </Paper>

            <StudyResults job={latestJob} fingerprint={fingerprint} />
        </Stack>
    )
}
