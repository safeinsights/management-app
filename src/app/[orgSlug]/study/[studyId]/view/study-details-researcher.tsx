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
// "Previous" returns to the OTTER-537 post-code-submission page. That page only
// renders at /view while the job is in CODE-SUBMITTED/CODE-SCANNED status; once
// results exist it is otherwise unroutable, so we reach it via ?from=code-submission,
// which page.tsx routes to CodePostSubmissionView with the under-review banner hidden.

type StudyDetailsResearcherProps = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    dashboardHref?: Route
}

export function StudyDetailsResearcher({ orgSlug, study, job, dashboardHref }: StudyDetailsResearcherProps) {
    const previousHref = Routes.studyView({ orgSlug, studyId: study.id, from: 'code-submission' })

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
