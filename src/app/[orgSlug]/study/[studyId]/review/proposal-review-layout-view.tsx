import { semanticColor } from '@/theme/tokens'
import type { ReactNode } from 'react'
import { Box, Paper, Stack } from '@mantine/core'
import { StudyPageLayout } from '@/components/study/study-page-layout'

// Presentational only: each section arrives as a slot, so this renders in isolation (e.g. Ladle).
export type ProposalReviewLayoutViewProps = {
    header: ReactNode
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
    header,
    listener,
    proposal,
    feedbackAndNotes,
    feedback,
    decision,
    actions,
    modals,
}: ProposalReviewLayoutViewProps) {
    return (
        <Box bg={semanticColor('surface.page')}>
            {listener}
            <StudyPageLayout header={header}>
                {proposal}
                {feedbackAndNotes}
                <Paper p="xxl">
                    <Stack gap="lg" data-testid="decision-card-body">
                        {feedback}
                        {decision}
                    </Stack>
                </Paper>
                {actions}
            </StudyPageLayout>
            {modals}
        </Box>
    )
}
