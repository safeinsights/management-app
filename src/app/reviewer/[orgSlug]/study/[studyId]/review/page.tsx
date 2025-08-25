'use server'

import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { isActionError } from '@/lib/errors'
import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { getStudyAction } from '@/server/actions/study.actions'
import React from 'react'
import { StudyReviewButtons } from './study-review-buttons'
import { StudyDetails } from '@/components/study/study-details'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { StudyResults } from './study-results'
import { latestJobForStudy } from '@/server/db/queries'

export default async function StudyReviewPage(props: {
    params: Promise<{
        orgSlug: string
        studyId: string
    }>
}) {
    const params = await props.params

    const { orgSlug, studyId } = params

    const study = await getStudyAction({ studyId })
    if (isActionError(study) || !study) {
        return <AlertNotFound title="Study was not found" message="no such study exists" />
    }

    const job = await latestJobForStudy(studyId)

    return (
        <Stack px="xl" gap="xl">
            <OrgBreadcrumbs
                crumbs={{
                    orgSlug: orgSlug,
                    current: 'Study Details',
                }}
            />

            <Title order={1}>Study details</Title>
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Proposal
                        </Title>
                        <StudyReviewButtons study={study} />
                    </Group>
                    {studyId && <StudyDetails studyId={study.id} />}
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

            <StudyResults job={job} />
        </Stack>
    )
}
