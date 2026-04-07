import { Paper, Skeleton, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'

type ReviewFeedbackSectionProps = {
    feedback: ReturnType<typeof useReviewFeedback>
}

export function ReviewFeedbackSection({ feedback }: ReviewFeedbackSectionProps) {
    return (
        <Paper p="xl" data-testid="review-feedback-section">
            <Text fw={600} mb="sm">
                Feedback — {feedback.wordCount}/{feedback.maxWords} words
            </Text>
            <Skeleton height={160} radius="md" />
        </Paper>
    )
}
