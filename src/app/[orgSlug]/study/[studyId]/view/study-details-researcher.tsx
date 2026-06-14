import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { ButtonLink } from '@/components/links'
import { Routes } from '@/lib/routes'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import type { Route } from 'next'
import { JobResultsStatusMessage } from './job-results-status-message'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

// OTTER-538: Study Details page (RL) — removes the "Study Code" section.
// OTTER-612: "Previous" navigates to the Code-approved decision page via ?from=code-decision.

type StudyDetailsResearcherProps = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    dashboardHref?: Route
    returnTo?: 'org'
}

export function StudyDetailsResearcher({ orgSlug, study, job, dashboardHref, returnTo }: StudyDetailsResearcherProps) {
    const previousHref = Routes.studyView({ orgSlug, studyId: study.id, from: 'code-decision', returnTo })

    return (
        <Stack px="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    studyId: study.id,
                    orgSlug,
                    current: 'Study Details',
                    dashboardHref,
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
                            Study Status
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    <JobResultsStatusMessage job={job} files={job.files} submittingOrgSlug={orgSlug} />
                </Stack>
            </Paper>
            <Group>
                <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                    Previous
                </ButtonLink>
            </Group>
        </Stack>
    )
}
