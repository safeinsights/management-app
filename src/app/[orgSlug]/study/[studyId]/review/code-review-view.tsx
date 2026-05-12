import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { AlertNotFound } from '@/components/errors'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { getStudyReviewAction } from '@/server/actions/study-job.actions'
import { isActionError } from '@/lib/errors'
import { ButtonLink } from '@/components/links'
import { Routes } from '@/lib/routes'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { StudyResultsWithReview } from './study-results-with-review'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { StudyReviewResult } from './study-review-types'
import { StudyReviewSection } from './study-review-section'

type CodeReviewViewProps = {
    orgSlug: string
    study: SelectedStudy
}

export async function CodeReviewView({ orgSlug, study }: CodeReviewViewProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }
    const reviewResult = await getStudyReviewAction({ studyJobId: job.id })
    // Soft-fail the seed: if the action errored, render the in-progress state and
    // let the client poller surface a real error on its next refetch.
    const initialReview: StudyReviewResult = isActionError(reviewResult) ? { kind: 'missing' } : reviewResult

    return (
        <Stack px="xl" gap="xl">
            <OrgBreadcrumbs
                crumbs={{
                    orgSlug,
                    current: 'Study Details',
                }}
            />
            <Title order={2} size="h4" fw={500}>
                Study Details
            </Title>
            <Divider />
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
            <Paper bg="white" p="xxl">
                <StudyReviewSection studyJobId={job.id} initialReview={initialReview} />
            </Paper>
            <StudyResultsWithReview job={job} study={study} />
            <Group>
                <ButtonLink
                    href={Routes.studyAgreements({ orgSlug, studyId: study.id, from: 'previous' })}
                    variant="subtle"
                    leftSection={<CaretLeftIcon />}
                >
                    Previous
                </ButtonLink>
            </Group>
        </Stack>
    )
}
