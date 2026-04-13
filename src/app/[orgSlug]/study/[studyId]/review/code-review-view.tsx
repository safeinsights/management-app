import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { latestJobForStudy } from '@/server/db/queries'
import { ButtonLink } from '@/components/links'
import { Routes } from '@/lib/routes'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { StudyResultsWithReview } from './study-results-with-review'
import type { SelectedStudy } from '@/server/actions/study.actions'

type CodeReviewViewProps = {
    orgSlug: string
    study: SelectedStudy
}

export async function CodeReviewView({ orgSlug, study }: CodeReviewViewProps) {
    const job = await latestJobForStudy(study.id)

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
            <StudyResultsWithReview job={job} study={study} />
            <Group>
                <ButtonLink
                    href={`${Routes.studyReview({ orgSlug, studyId: study.id })}?from=agreements`}
                    variant="subtle"
                    leftSection={<CaretLeftIcon />}
                >
                    Previous
                </ButtonLink>
            </Group>
        </Stack>
    )
}
