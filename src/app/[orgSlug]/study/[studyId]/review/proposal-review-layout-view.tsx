import type { ReactNode } from 'react'
import { Box, Paper, Stack } from '@mantine/core'
import { StudyPageHeader } from '@/components/study/study-page-header'

// Presentational chrome for the "Review initial request" (proposal review) page. It owns the
// page background, title, and the vertical layout of the review sections — but
// NOT the realtime/session plumbing (Yjs feedback provider, review mutation, kick-out guard)
// or the data those sections need. Each section is supplied as a slot so the hook-driven
// pieces stay in the container, which lets this render in isolation (e.g. Ladle). The
// ProposalReviewView container (./proposal-review-view) provides the real slots and listener.
export type ProposalReviewLayoutViewProps = {
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
                <StudyPageHeader>Review initial request</StudyPageHeader>

                {proposal}
                {feedbackAndNotes}
                <Paper p="xxl">
                    <Stack gap={24} data-testid="decision-card-body">
                        {feedback}
                        {decision}
                    </Stack>
                </Paper>
                {actions}
            </Stack>
            {modals}
        </Box>
    )
}
