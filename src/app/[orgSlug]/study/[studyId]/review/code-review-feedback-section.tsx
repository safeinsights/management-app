'use client'

import dynamic from 'next/dynamic'
import { Divider, Paper, Skeleton, Stack, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { WordCounter } from '@/components/word-counter'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { usePublishCodeReviewFeedbackProvider } from '@/lib/realtime/code-review-feedback-provider-context'
import { codeReviewFeedbackDocName } from '@/lib/collaboration-documents'

const EDITOR_SKELETON = <Skeleton h={400} radius={4} />

const CollaborativeEditor = dynamic(
    () => import('@/components/editable-text/collaborative-editor').then((mod) => mod.CollaborativeEditor),
    {
        ssr: false,
        loading: () => EDITOR_SKELETON,
    },
)

const contentStyle = {
    minHeight: 400,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '1rem',
    lineHeight: 1.6,
} as const

type CodeReviewFeedbackSectionProps = {
    feedback: ReturnType<typeof useReviewFeedback>
    studyId: string
    jobId: string
}

const PLACEHOLDER_TEXT = 'Share your feedback on the submitted code...'

function FeedbackEditor({
    feedback,
    studyId,
    jobId,
}: {
    feedback: ReturnType<typeof useReviewFeedback>
    studyId: string
    jobId: string
}) {
    const websocketProvider = useYjsWebsocket()
    const publishProvider = usePublishCodeReviewFeedbackProvider()
    if (!websocketProvider) return EDITOR_SKELETON
    return (
        <CollaborativeEditor
            id={codeReviewFeedbackDocName(jobId)}
            studyId={studyId}
            websocketProvider={websocketProvider}
            contentStyle={contentStyle}
            onChange={feedback.onChange}
            placeholder={PLACEHOLDER_TEXT}
            footerRight={<WordCounter wordCount={feedback.wordCount} maxWords={feedback.maxWords} />}
            onProviderReady={publishProvider}
        />
    )
}

export function CodeReviewFeedbackSection({ feedback, studyId, jobId }: CodeReviewFeedbackSectionProps) {
    return (
        <Paper p="xxl" data-testid="code-review-feedback-section">
            <Stack gap="lg">
                <Text fz={20} fw={700} c="charcoal.9">
                    Code review feedback
                </Text>
                <Divider />
                <Stack gap="md">
                    <FeedbackEditor feedback={feedback} studyId={studyId} jobId={jobId} />
                </Stack>
            </Stack>
        </Paper>
    )
}
