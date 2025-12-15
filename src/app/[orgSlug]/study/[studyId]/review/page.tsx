'use server'

import { AccessDeniedAlert, AlertNotFound } from '@/components/errors'
import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { StudyDetails } from '@/components/study/study-details'
import { isActionError } from '@/lib/errors'
import { getStudyAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
import { latestJobForStudy } from '@/server/db/queries'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { StudyResults } from './study-results'
import { ResearcherReviewButtons } from './researcher-review-buttons'
import { StudyReviewButtons } from './study-review-buttons'
import { auth } from '@clerk/nextjs/server'

export default async function StudyReviewPage(props: {
    params: Promise<{
        orgSlug: string
        studyId: string
    }>
}) {
    const params = await props.params
    const session = await sessionFromClerk()

    if (!session?.belongsToEnclave) {
        return <AccessDeniedAlert />
    }

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
                    current: 'Review submission',
                }}
            />
            <Title order={2} size="h4" fw={500}>
                Review submission
            </Title>
            <Divider />
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Proposal
                        </Title>
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
                    </Group>
                    <Divider c="dimmed" />
                    <StudyCodeDetails job={job} />
                </Stack>
            </Paper>
            <StudyResults job={job} />
            <StudyReviewButtons study={study} />
        </Stack>
    )
}
