import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyCodeDetails } from '@/components/study/study-code-details'
import { Routes } from '@/lib/routes'
import { Button, Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { JobResultsStatusMessage } from './job-results-status-message'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

type CodeOnlyViewProps = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
}

export function CodeOnlyView({ orgSlug, study, job }: CodeOnlyViewProps) {
    return (
        <Stack px="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId: study.id,
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
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Status
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    <JobResultsStatusMessage job={job} files={job.files} submittingOrgSlug={orgSlug} />
                </Stack>
            </Paper>
            <Group>
                <Button
                    component={Link}
                    href={Routes.studyAgreements({ orgSlug, studyId: study.id })}
                    variant="subtle"
                    leftSection={<CaretLeftIcon />}
                >
                    Previous
                </Button>
            </Group>
        </Stack>
    )
}
