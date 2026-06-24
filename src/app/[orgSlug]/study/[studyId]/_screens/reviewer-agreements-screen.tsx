import { Stack, Title } from '@mantine/core'
import { OrgBreadcrumbs } from '@/components/page-breadcrumbs'
import { Routes } from '@/lib/routes'
import { AgreementsPage } from '../agreements/agreements-page'
import type { ScreenComponentProps } from './types'

// Reviewer agreements gate, modelled as a screen (not a redirect). Acking proceeds into code review
// (the bare /review re-resolves to reviewer-code-review once reviewerAgreementsAckedAt is set);
// Previous returns to the dashboard. No ?from= — the screen authority decides the next view.
export function ReviewerAgreementsScreen({ study, orgSlug, dashboardHref }: ScreenComponentProps) {
    const reviewHref = Routes.studyReview({ orgSlug, studyId: study.id })
    return (
        <Stack p="xl" gap="xl">
            <OrgBreadcrumbs crumbs={{ orgSlug, current: 'Agreements' }} />
            <Title order={1}>Study request</Title>
            <AgreementsPage
                isReviewer
                studyId={study.id}
                proceedHref={reviewHref}
                previousHref={dashboardHref}
                previousLabel="Previous"
            />
        </Stack>
    )
}
