'use client'

import dynamic from 'next/dynamic'
import { Divider, Group, Paper, Skeleton, Stack, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { WordCounter } from '@/components/word-counter'

const CollaborativeEditor = dynamic(
    () => import('@/components/editable-text/collaborative-editor').then((mod) => mod.CollaborativeEditor),
    {
        ssr: false,
        loading: () => <Skeleton h={600} radius={4} />,
    },
)

const containerProps = {
    radius: 4,
    style: { border: '1px solid #D9D9D9' },
} as const

const contentStyle = {
    minHeight: 600,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '1rem',
    lineHeight: 1.6,
} as const

type ReviewFeedbackSectionProps = {
    feedback: ReturnType<typeof useReviewFeedback>
    submittingOrgName: string
    studyId: string
    wsUrl: string
}

export function ReviewFeedbackSection({ feedback, submittingOrgName, studyId, wsUrl }: ReviewFeedbackSectionProps) {
    return (
        <Paper p="xxl" data-testid="review-feedback-section">
            <Stack gap="lg">
                <Text fz={20} fw={700} c="charcoal.9">
                    Initial request review
                </Text>
                <Divider />
                <Stack gap="md">
                    <Text fz={16} c="charcoal.9">
                        Share your feedback on this request directly with {submittingOrgName}. Consider addressing the
                        initial request&apos;s feasibility given your data and infrastructure, its potential to advance
                        the understanding of teaching and learning, and any questions or clarifications you need from
                        the research team.
                    </Text>
                    <Text fz={14} c="charcoal.7">
                        Minimum {feedback.minWords} words required.
                    </Text>
                    <CollaborativeEditor
                        id={`review-feedback-${studyId}`}
                        wsUrl={wsUrl}
                        contentStyle={contentStyle}
                        containerProps={containerProps}
                        onChange={feedback.onChange}
                    />
                    <Group justify="flex-end">
                        <WordCounter wordCount={feedback.wordCount} maxWords={feedback.maxWords} />
                    </Group>
                </Stack>
            </Stack>
        </Paper>
    )
}
