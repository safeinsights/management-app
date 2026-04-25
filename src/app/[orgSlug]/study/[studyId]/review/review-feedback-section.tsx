'use client'

import dynamic from 'next/dynamic'
import { Divider, Group, Paper, Skeleton, Stack, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { WordCounter } from '@/components/word-counter'
import { WS_URL } from '@/server/config'

const CollaborativeEditor = dynamic(
    () => import('@/components/editable-text/collaborative-editor').then((mod) => mod.CollaborativeEditor),
    {
        ssr: false,
        loading: () => <Skeleton h={600} radius={4} />,
    },
)

const contentStyle = {
    minHeight: 600,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '1rem',
    lineHeight: 1.6,
} as const

type ReviewFeedbackSectionProps = {
    feedback: ReturnType<typeof useReviewFeedback>
    submittingLabName: string
    studyId: string
}

export function ReviewFeedbackSection({ feedback, submittingLabName, studyId }: ReviewFeedbackSectionProps) {
    return (
        <Paper p="xxl" data-testid="review-feedback-section">
            <Stack gap="lg">
                <Text fz={20} fw={700} c="charcoal.9">
                    Initial request review
                </Text>
                <Divider />
                <Stack gap="md">
                    <Text fz={16} c="charcoal.9">
                        Share your feedback on this request directly with {submittingLabName}. Consider addressing the
                        initial request&apos;s feasibility given your data and infrastructure, its potential to advance
                        the understanding of teaching and learning, and any questions or clarifications you need from
                        the research team.
                    </Text>
                    <Text fz={14} c="charcoal.7">
                        Minimum {feedback.minWords} words required.
                    </Text>
                    <CollaborativeEditor
                        id={`review-feedback-${studyId}`}
                        wsUrl={WS_URL}
                        contentStyle={contentStyle}
                        onChange={feedback.onChange}
                        placeholder={`For e.g., "This study is feasible with our current data. We can provide the requested variables for the specified time period. Question: Will you need student demographic data beyond what is listed?"`}
                    />
                    <Group justify="flex-end">
                        <WordCounter wordCount={feedback.wordCount} maxWords={feedback.maxWords} />
                    </Group>
                </Stack>
            </Stack>
        </Paper>
    )
}
