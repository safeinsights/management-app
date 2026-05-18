import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { AlertNotFound } from '@/components/errors'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { ButtonLink } from '@/components/links'
import { Routes } from '@/lib/routes'
import { Divider, Group, Stack, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import type { Route } from 'next'
import { StudyResultsRedesignWithReview } from './study-results-redesign-with-review'
import type { SelectedStudy } from '@/server/actions/study.actions'

// OTTER-538: Study Details page (DO) — results-only layout.
// Removes the "Study Code" section. The "Previous" button takes the DO back to
// the post-code-feedback page from OTTER-552.

type StudyDetailsRedesignViewProps = {
    orgSlug: string
    study: SelectedStudy
}

export async function StudyDetailsRedesignView({ orgSlug, study }: StudyDetailsRedesignViewProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) {
        return <AlertNotFound title="No submission found" message="This study has no submitted code to review." />
    }

    const previousHref = `${Routes.studyReview({ orgSlug, studyId: study.id })}?from=code-review` as Route

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
            <StudyResultsRedesignWithReview job={job} study={study} />
            <Group>
                <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                    Previous
                </ButtonLink>
            </Group>
        </Stack>
    )
}
