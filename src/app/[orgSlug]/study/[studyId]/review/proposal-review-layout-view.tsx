import type { ReactNode } from 'react'
import { Box, Paper, Stack } from '@mantine/core'
import { StudyPageHeader } from '@/components/study/study-page-header'

// Presentational only: each section arrives as a slot, so this renders in isolation (e.g. Ladle).
export type ProposalReviewLayoutViewProps = {
    listener?: ReactNode
    proposal: ReactNode
    feedbackAndNotes: ReactNode
    feedback: ReactNode
    decision: ReactNode
    actions: ReactNode
    // Portal overlays, so rendered outside the page box.
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
