'use client'

import { type ReactNode } from 'react'
import { Divider, Group, Paper, Radio, Stack, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { RequiredIndicator } from '@/components/required-indicator'
import { fieldDescribedBy, FieldErrorBox, useWidgetBlur } from '@/components/form-field'
import { CharacterCounter } from '@/components/character-counter'
import { Editor } from '@/components/editable-text/editor'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { usePublishCodeReviewFeedbackProvider } from '@/lib/realtime/code-review-feedback-provider-context'
import { codeReviewFeedbackDocName } from '@/lib/collaboration-documents'
import type { Decision } from '@/lib/review-decision'

const EDITOR_SKELETON_HEIGHT = 400

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
    onDecisionBlur: () => void
    decisionError: ReactNode
    labName: string
}

function FeedbackIntro({ labName }: { labName: string }) {
    return (
        <Text fz={16} c="charcoal.9">
            Share your feedback on this code submission with {labName}. Your comments should address the code’s
            alignment with the approved study proposal/initial request and all the agreements, whether the security log
            surfaced issues, and whether the analysis code risks exposing PII. You can also request clarifications about
            the researchers’ approach and flag potential risks or misconceptions about your dataset(s) before the code
            is approved to run.
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
    return (
        <Editor
            id={codeReviewFeedbackDocName(jobId)}
            inputId="code-review-feedback"
            studyId={studyId}
            websocketProvider={websocketProvider}
            contentStyle={contentStyle}
            onChange={feedback.onChange}
            onBlur={feedback.onBlur}
            error={feedback.error}
            ariaLabel="Code review feedback"
            ariaRequired
            ariaDescribedBy={fieldDescribedBy('code-review-feedback', {
                hasError: !!feedback.error,
                hasDescription: false,
            })}
            placeholder={FEEDBACK_PLACEHOLDER}
            // The error takes exactly the slot the save indicator vacates, so it sits directly
            // under the input instead of a row below the character counter (OTTER-674).
            footerLeft={<FieldErrorBox fieldId="code-review-feedback" error={feedback.error} />}
            footerRight={<CharacterCounter count={feedback.characterCount} maxCharacters={feedback.maxCharacters} />}
            onProviderReady={publishProvider}
            skeletonHeight={EDITOR_SKELETON_HEIGHT}
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
]

const RADIO_STYLES = {
    label: { fontWeight: 600, fontSize: 16 },
    description: { fontSize: 14 },
}

function DecisionRadioGroup({
    value,
    onChange,
    onBlur,
    error,
    labName,
}: {
    value: Decision | null
    onChange: (next: Decision) => void
    onBlur: () => void
    error: ReactNode
    labName: string
}) {
    const options = buildDecisionOptions(labName)
    const handleChange = (next: string) => onChange(next as Decision)
    const widgetBlur = useWidgetBlur(onBlur)

    // Radio.Group's context carries value/onChange/size/name/disabled to its children but not
    // `error`, so the circles stay grey while the group's message turns red. A boolean `error`
    // applies Mantine's error styling without adding a second message (OTTER-647).
    const radioOptions = options.map((option) => (
        <Radio
            key={option.value}
            value={option.value}
            label={option.title}
            description={option.description}
            styles={RADIO_STYLES}
            error={!!error}
            data-testid={option.testId}
        />
    ))

    return (
        // Blur is a bubbled focusout, so moving between radios would validate a still-empty
        // group; useWidgetBlur waits for the user to leave it (OTTER-647).
        // A real `label`, not `aria-label`: see the note in review-decision-section. It names the
        // role="radiogroup" element and makes `withAsterisk` render a visible required marker.
        <Radio.Group
            value={value ?? ''}
            onChange={handleChange}
            {...widgetBlur}
            name="code-review-decision"
            label="Code review decision"
            labelProps={{ fw: 600 }}
            withAsterisk
            error={error}
        >
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
    onDecisionBlur,
    decisionError,
    labName,
}: CodeReviewFeedbackSectionProps) {
    return (
        <Paper p="xxl" data-testid="code-review-section">
            <Stack gap="lg">
                <Group gap={4} align="center">
                    <Text fz={20} fw={700} c="charcoal.9">
                        Code review
                    </Text>
                    <RequiredIndicator fz={20} fw={700} />
                </Group>
                <Divider />
                <FeedbackIntro labName={labName} />
                <FeedbackEditor feedback={feedback} studyId={studyId} jobId={jobId} />
                <Divider />
                <DecisionRadioGroup
                    value={decisionValue}
                    onChange={onDecisionChange}
                    onBlur={onDecisionBlur}
                    error={decisionError}
                    labName={labName}
                />
            </Stack>
        </Paper>
    )
}
