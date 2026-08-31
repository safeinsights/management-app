'use client'

import { Divider, Group, Paper, Stack, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { RequiredIndicator } from '@/components/required-indicator'
import { fieldDescribedBy, FieldErrorBox } from '@/components/form-field'
import { WordCounter } from '@/components/word-counter'
import { Editor } from '@/components/editable-text/editor'
import { reviewFeedbackDocNameForVersion } from '@/lib/collaboration-documents'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { usePublishReviewFeedbackProvider } from '@/lib/realtime/review-feedback-provider-context'

const EDITOR_SKELETON_HEIGHT = 600

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
    reviewVersion: number
}

const PLACEHOLDER_TEXT = `For e.g., "This study is feasible with our current data. We can provide the requested variables for the specified time period. Question: Will you need student demographic data beyond what is listed?"`

function feedbackHeading(reviewVersion: number) {
    return reviewVersion <= 1 ? 'Initial request review' : `Round ${reviewVersion} review`
}

function FeedbackEditor({
    feedback,
    studyId,
    reviewVersion,
}: {
    feedback: ReturnType<typeof useReviewFeedback>
    studyId: string
    reviewVersion: number
}) {
    const websocketProvider = useYjsWebsocket()
    const publishProvider = usePublishReviewFeedbackProvider()
    return (
        <Editor
            id={reviewFeedbackDocNameForVersion(studyId, reviewVersion)}
            inputId="review-feedback"
            studyId={studyId}
            websocketProvider={websocketProvider}
            contentStyle={contentStyle}
            onChange={feedback.onChange}
            onBlur={feedback.onBlur}
            error={feedback.error}
            ariaLabel="Initial request review feedback"
            ariaRequired
            ariaDescribedBy={fieldDescribedBy('review-feedback', {
                hasError: !!feedback.error,
                hasDescription: false,
            })}
            placeholder={PLACEHOLDER_TEXT}
            // The error takes exactly the slot the save indicator vacates, so it sits directly
            // under the input instead of a row below the word counter (OTTER-674).
            footerLeft={<FieldErrorBox fieldId="review-feedback" error={feedback.error} />}
            footerRight={<WordCounter wordCount={feedback.wordCount} maxWords={feedback.maxWords} />}
            onProviderReady={publishProvider}
            skeletonHeight={EDITOR_SKELETON_HEIGHT}
        />
    )
}

export function ReviewFeedbackSection({
    feedback,
    submittingLabName,
    studyId,
    reviewVersion,
}: ReviewFeedbackSectionProps) {
    return (
        <Paper p="xxl" data-testid="review-feedback-section">
            <Stack gap="lg">
                <Group gap={4} align="center">
                    <Text fz={20} fw={700} c="charcoal.9">
                        {feedbackHeading(reviewVersion)}
                    </Text>
                    <RequiredIndicator fz={20} fw={700} />
                </Group>
                <Divider />
                <Stack gap="md">
                    <Text fz={16} c="charcoal.9">
                        Share your feedback on this request directly with {submittingLabName}. Consider addressing the
                        initial request’s feasibility given your data and infrastructure, its potential to advance the
                        understanding of teaching and learning, and any questions or clarifications you need from the
                        research team.
                    </Text>
                    <FeedbackEditor feedback={feedback} studyId={studyId} reviewVersion={reviewVersion} />
                </Stack>
            </Stack>
        </Paper>
    )
}
