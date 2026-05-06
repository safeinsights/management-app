'use client'

import dynamic from 'next/dynamic'
import { Divider, Paper, Skeleton, Stack, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { WordCounter } from '@/components/word-counter'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'

const EDITOR_SKELETON = <Skeleton h={600} radius={4} />

const CollaborativeEditor = dynamic(
    () => import('@/components/editable-text/collaborative-editor').then((mod) => mod.CollaborativeEditor),
    {
        ssr: false,
        loading: () => EDITOR_SKELETON,
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

const PLACEHOLDER_TEXT = `For e.g., "This study is feasible with our current data. We can provide the requested variables for the specified time period. Question: Will you need student demographic data beyond what is listed?"`

function FeedbackEditor({ feedback, studyId }: { feedback: ReturnType<typeof useReviewFeedback>; studyId: string }) {
    const websocketProvider = useYjsWebsocket()
    if (!websocketProvider) return EDITOR_SKELETON
    return (
        <CollaborativeEditor
            id={`review-feedback-${studyId}`}
            studyId={studyId}
            websocketProvider={websocketProvider}
            contentStyle={contentStyle}
            onChange={feedback.onChange}
            placeholder={PLACEHOLDER_TEXT}
            footerRight={<WordCounter wordCount={feedback.wordCount} maxWords={feedback.maxWords} />}
        />
    )
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
                    <FeedbackEditor feedback={feedback} studyId={studyId} />
                </Stack>
            </Stack>
        </Paper>
    )
}
