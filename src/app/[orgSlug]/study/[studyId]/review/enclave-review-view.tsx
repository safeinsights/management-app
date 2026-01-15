import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { StudyDetails } from '@/components/study/study-details'
import { latestJobForStudy } from '@/server/db/queries'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { StudyResults } from './study-results'
import { StudyReviewButtons } from './study-review-buttons'
import type { SelectedStudy } from '@/server/actions/study.actions'

type EnclaveReviewViewProps = {
    orgSlug: string
    study: SelectedStudy
}

export async function EnclaveReviewView({ orgSlug, study }: EnclaveReviewViewProps) {
    const job = await latestJobForStudy(study.id)

    return (
        <Stack px="xl" gap="xl">
            <OrgBreadcrumbs
                crumbs={{
                    orgSlug: orgSlug,
                    current: 'Review submission',
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
                    </Group>
                    <StudyDetails studyId={study.id} />
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
