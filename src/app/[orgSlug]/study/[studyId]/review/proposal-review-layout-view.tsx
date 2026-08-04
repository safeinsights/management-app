import type { ReactNode } from 'react'
import { Box, Stack } from '@mantine/core'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { Routes } from '@/lib/routes'

// Presentational chrome for the "Review initial request" (proposal review) page. It owns the
// page background, breadcrumbs, title, and the vertical layout of the review sections — but
// NOT the realtime/session plumbing (Yjs feedback provider, review mutation, kick-out guard)
// or the data those sections need. Each section is supplied as a slot so the hook-driven
// pieces stay in the container, which lets this render in isolation (e.g. Ladle). The
// ProposalReviewView container (./proposal-review-view) provides the real slots and listener.
export type ProposalReviewLayoutViewProps = {
    orgSlug: string
    studyId: string
    /** Realtime kick-out listener, injected by the container (no-op markup in isolation). */
    listener?: ReactNode
    proposal: ReactNode
    feedbackAndNotes: ReactNode
    feedback: ReactNode
    decision: ReactNode
    actions: ReactNode
    /** Confirmation modals, injected by the container; portal overlays, so rendered outside the page box. */
    modals?: ReactNode
}

export function ProposalReviewLayoutView({
    orgSlug,
    studyId,
    listener,
    proposal,
    feedbackAndNotes,
    feedback,
    decision,
    actions,
    modals,
}: ProposalReviewLayoutViewProps) {
    return (
        <Box bg="grey.10">
            {listener}
            <Stack px="xl" gap="xxl" py="xl">
                <PageBreadcrumbs
                    crumbs={[
                        ['Dashboard', Routes.orgDashboard({ orgSlug })],
                        ['Data use request', Routes.studyReview({ orgSlug, studyId })],
                        ['Review initial request'],
                    ]}
                />

                <StudyPageHeader>Review initial request</StudyPageHeader>

                {proposal}
                {feedbackAndNotes}
                {feedback}
                {decision}
                {actions}
            </Stack>
            {modals}
        </Box>
    )
}
