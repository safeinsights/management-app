'use client'

import { WordCounter } from '@/components/word-counter'
import type { useCodeReviewFeedback } from '@/hooks/use-code-review-feedback'
import { codeReviewFeedbackDocName } from '@/lib/collaboration-documents'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { Divider, Skeleton, Stack, Text } from '@mantine/core'
import dynamic from 'next/dynamic'

const EDITOR_SKELETON = <Skeleton h={300} radius={4} />

const CollaborativeEditor = dynamic(
    () => import('@/components/editable-text/collaborative-editor').then((mod) => mod.CollaborativeEditor),
    {
        ssr: false,
        loading: () => EDITOR_SKELETON,
    },
)

const contentStyle = {
    minHeight: 300,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '1rem',
    lineHeight: 1.6,
} as const

type CodeReviewFeedbackSectionProps = {
    feedback: ReturnType<typeof useCodeReviewFeedback>
    labName: string
    studyId: string
}

const PLACEHOLDER_TEXT =
    'The code aligns with the approved proposal and accesses only the variables specified in the data use agreement. Outputs are aggregated at the group level, with no individual-level data exposed. Security scans passed with no issues. One question: the code filters by enrollment date, which appears to be a deviation from your initial proposal. Can you please share your rationale for using this variable?'

function FeedbackEditor({
    feedback,
    studyId,
}: {
    feedback: CodeReviewFeedbackSectionProps['feedback']
    studyId: string
}) {
    const websocketProvider = useYjsWebsocket()
    if (!websocketProvider) return EDITOR_SKELETON
    return (
        <CollaborativeEditor
            id={codeReviewFeedbackDocName(studyId)}
            studyId={studyId}
            websocketProvider={websocketProvider}
            contentStyle={contentStyle}
            placeholder={PLACEHOLDER_TEXT}
            onChange={feedback.onChange}
            footerRight={<WordCounter wordCount={feedback.wordCount} maxWords={feedback.maxWords} />}
        />
    )
}

export function CodeReviewFeedbackSection({ feedback, labName, studyId }: CodeReviewFeedbackSectionProps) {
    return (
        <Stack gap="md" data-testid="code-review-feedback-section">
            <Text fz={20} fw={700} c="charcoal.9">
                Code review{' '}
                <Text component="span" c="red.9" aria-hidden="true">
                    *
                </Text>
            </Text>
            <Divider />
            <Text size="md" c="charcoal.9">
                Share your feedback on this code submission with {labName}. Your comments should address the code&apos;s
                alignment with the approved study proposal/initial request and all the agreements, whether the security
                log surfaced issues, and whether the analysis code risks exposing PII. You can also request
                clarifications about the researchers&apos; approach and flag potential risks or misconceptions about
                your dataset(s) before the code is approved to run.
            </Text>
            <FeedbackEditor feedback={feedback} studyId={studyId} />
        </Stack>
    )
}
