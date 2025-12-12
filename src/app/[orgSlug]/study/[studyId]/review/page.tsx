'use server'

import { AlertNotFound } from '@/components/errors'
import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { StudyDetails } from '@/components/study/study-details'
import { isActionError } from '@/lib/errors'
import { getStudyAction } from '@/server/actions/study.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { StudyResults } from './study-results'
import Link from 'next/link'
import { ResearcherReviewButtons } from './researcher-review-buttons'
import { StudyReviewButtons } from './study-review-buttons'
import { Routes } from '@/lib/routes'
import { auth } from '@clerk/nextjs/server'

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

    // Check if the current user is the study owner (researcher) or a reviewer
    const { userId } = await auth()
    const isResearcher = userId === study.createdBy

    return (
        <Stack px="xl" gap="xl">
            <OrgBreadcrumbs
                crumbs={{
                    orgSlug: orgSlug,
                    current: 'Review your submission',
                }}
            />
            <Title order={2} size="h4" fw={500}>
                Review your submission
            </Title>
            <Divider />
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Proposal
                        </Title>
                        <Link href={Routes.studyEdit({ orgSlug, studyId })}>Edit</Link>
                    </Group>
                    {studyId && <StudyDetails studyId={study.id} />}
                </Stack>
            </Paper>
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Code
                        </Title>
                        <Link href={Routes.studyResubmit({ orgSlug, studyId })}>Edit</Link>
                    </Group>
                    <Divider c="dimmed" />
                    <StudyCodeDetails job={job} />
                </Stack>
            </Paper>
            <StudyResults job={job} />
            {isResearcher ? <ResearcherReviewButtons study={study} /> : <StudyReviewButtons study={study} />}
        </Stack>
    )
}
