'use client'

import dynamic from 'next/dynamic'
import { type ReactNode } from 'react'
import { Divider, Group, Paper, Radio, Skeleton, Stack, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { WordCounter } from '@/components/word-counter'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { usePublishCodeReviewFeedbackProvider } from '@/lib/realtime/code-review-feedback-provider-context'
import { codeReviewFeedbackDocName } from '@/lib/collaboration-documents'
import type { Decision } from '@/lib/review-decision'

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
    fontSize: '14px',
    lineHeight: 1.6,
} as const

const FEEDBACK_PLACEHOLDER =
    '“The code aligns with the approved proposal and accesses only the variables specified in the data use agreement. ' +
    'Outputs are aggregated at the group level, with no individual-level data exposed. ' +
    'Security scans passed with no issues. ' +
    'One question: the code filters by enrollment date, which appears to be a deviation from your initial proposal. ' +
    'Can you please share your rationale for using this variable?”'

type CodeReviewFeedbackSectionProps = {
    feedback: ReturnType<typeof useReviewFeedback>
    studyId: string
    jobId: string
    decisionValue: Decision | null
    onDecisionChange: (next: Decision) => void
    labName: string
}

function FeedbackIntro({ labName }: { labName: string }) {
    return (
        <Text fz={16} c="charcoal.9">
            Share your feedback on this code submission with {labName}. Your comments should address the code&rsquo;s
            alignment with the approved study proposal/initial request and all the agreements, whether the security log
            surfaced issues, and whether the analysis code risks exposing PII. You can also request clarifications
            about the researchers&rsquo; approach and flag potential risks or misconceptions about your dataset(s)
            before the code is approved to run.
        </Text>
    )
}

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
            placeholder={FEEDBACK_PLACEHOLDER}
            footerRight={<WordCounter wordCount={feedback.wordCount} maxWords={feedback.maxWords} />}
            onProviderReady={publishProvider}
        />
    )
}

type DecisionOption = {
    value: Decision
    title: string
    description: ReactNode
    testId: string
}

const buildDecisionOptions = (labName: string): DecisionOption[] => [
    {
        value: 'approve',
        title: 'Approve and run code',
        description: (
            <Text component="span" size="sm" c="grey.7">
                The code will proceed to run in your secure enclave. {labName} will be notified via email when the code
                is approved and is being run.
            </Text>
        ),
        testId: 'code-review-decision-approve',
    },
    {
        value: 'needs-clarification',
        title: 'Request revision',
        description: (
            <Text component="span" size="sm" c="grey.7">
                Return this code submission to {labName} for necessary updates, additional information, or specific
                changes.
            </Text>
        ),
        testId: 'code-review-decision-needs-clarification',
    },
    {
        value: 'reject',
        title: 'Reject and end study',
        description: (
            <Text component="span" size="sm" c="grey.7">
                Permanently end this study due to major, unresolvable issues. Share rationale with {labName}.
                <br />
                <Text component="span" size="sm" c="grey.7" fw={600}>
                    Warning: This terminates the study and cannot be undone.
                </Text>
            </Text>
        ),
        testId: 'code-review-decision-reject',
    },
]

const RADIO_STYLES = {
    label: { fontWeight: 600, fontSize: 16 },
    description: { fontSize: 14 },
}

function DecisionRadioGroup({
    value,
    onChange,
    labName,
}: {
    value: Decision | null
    onChange: (next: Decision) => void
    labName: string
}) {
    const options = buildDecisionOptions(labName)
    const handleChange = (next: string) => onChange(next as Decision)

    const radioOptions = options.map((option) => (
        <Radio
            key={option.value}
            value={option.value}
            label={option.title}
            description={option.description}
            styles={RADIO_STYLES}
            data-testid={option.testId}
        />
    ))

    return (
        <Radio.Group value={value ?? ''} onChange={handleChange} name="code-review-decision">
            <Stack gap="md">{radioOptions}</Stack>
        </Radio.Group>
    )
}

export function CodeReviewFeedbackSection({
    feedback,
    studyId,
    jobId,
    decisionValue,
    onDecisionChange,
    labName,
}: CodeReviewFeedbackSectionProps) {
    return (
        <Paper p="xxl" data-testid="code-review-section">
            <Stack gap="lg">
                <Group gap={4} align="center">
                    <Text fz={20} fw={700} c="charcoal.9">
                        Code review
                    </Text>
                    <Text fz={20} fw={700} c="red.9" component="span">
                        *
                    </Text>
                </Group>
                <Divider />
                <FeedbackIntro labName={labName} />
                <FeedbackEditor feedback={feedback} studyId={studyId} jobId={jobId} />
                <Divider />
                <DecisionRadioGroup value={decisionValue} onChange={onDecisionChange} labName={labName} />
            </Stack>
        </Paper>
    )
}
