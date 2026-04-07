import { Paper, Skeleton, Text } from '@mantine/core'
import type { useReviewDecision } from '@/hooks/use-review-decision'

type ReviewDecisionSectionProps = {
    decision: ReturnType<typeof useReviewDecision>
}

export function ReviewDecisionSection({ decision }: ReviewDecisionSectionProps) {
    return (
        <Paper p="xl" data-testid="review-decision-section">
            <Text fw={600} mb="sm">
                Decision — {decision.selected ?? 'None selected'}
            </Text>
            <Skeleton height={80} radius="md" />
        </Paper>
    )
}
