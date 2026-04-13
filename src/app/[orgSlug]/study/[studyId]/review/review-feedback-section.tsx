import { Group, Paper, Skeleton, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { WordCounter } from '@/components/word-counter'

type ReviewFeedbackSectionProps = {
    feedback: ReturnType<typeof useReviewFeedback>
}

export function ReviewFeedbackSection({ feedback }: ReviewFeedbackSectionProps) {
    return (
        <Paper p="xl" data-testid="review-feedback-section">
            <Group gap="xs" mb="sm">
                <Text fw={600}>Feedback</Text>
                <WordCounter wordCount={feedback.wordCount} maxWords={feedback.maxWords} />
            </Group>
            <Skeleton height={160} radius="md" />
        </Paper>
    )
}
