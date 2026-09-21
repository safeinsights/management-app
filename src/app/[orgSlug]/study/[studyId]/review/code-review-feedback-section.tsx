'use client'

import { type ReactNode } from 'react'
import { Box, Divider, Group, Paper, Radio, Stack, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { RequiredIndicator } from '@/components/required-indicator'
import { fieldErrorId, FieldErrorBox, useWidgetBlur } from '@/components/form-field'
import { DecisionFeedbackEditor } from './decision-feedback-editor'
import { usePublishCodeReviewFeedbackProvider } from '@/lib/realtime/code-review-feedback-provider-context'
import { codeReviewFeedbackDocName } from '@/lib/collaboration-documents'
import type { Decision } from '@/lib/review-decision'
import { fontWeight, semanticColor } from '@/theme/tokens'

const EDITOR_SKELETON_HEIGHT = 400

const contentStyle = {
    minHeight: 400,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '14px',
    lineHeight: 1.6,
} as const

const SECTION_HEADING_ID = 'code-review-decision-heading'
export const FEEDBACK_INPUT_ID = 'code-review-feedback'
export const DECISION_GROUP_ID = 'code-review-decision-group'

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
        <Text fz={16} c={semanticColor('text.primary')}>
            Share your decision and feedback with {labName} based on the evaluation criteria above. You can also request
            clarifications, flag dataset risks, or outline required changes.
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
    const publishProvider = usePublishCodeReviewFeedbackProvider()
    return (
        <DecisionFeedbackEditor
            feedback={feedback}
            studyId={studyId}
            docName={codeReviewFeedbackDocName(jobId)}
            inputId={FEEDBACK_INPUT_ID}
            ariaLabel="Code review feedback"
            contentStyle={contentStyle}
            skeletonHeight={EDITOR_SKELETON_HEIGHT}
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
                The code will run in your secure enclave and your feedback will be shared with {labName}.
            </Text>
        ),
        testId: 'code-review-decision-approve',
    },
    {
        value: 'needs-clarification',
        title: 'Request revision',
        description: (
            <Text component="span" size="sm" c="grey.7">
                Send the code back to {labName} for changes or additional information.
            </Text>
        ),
        testId: 'code-review-decision-needs-clarification',
    },
]

const RADIO_STYLES = {
    label: { fontWeight: 600, fontSize: 16 },
    description: { fontSize: 14 },
}

const decisionDescriptionId = (value: Decision) => `${DECISION_GROUP_ID}-${value}-description`

function DecisionRadioOption({
    option,
    error,
    errorId,
}: {
    option: DecisionOption
    error: ReactNode
    errorId: string
}) {
    // Mantine shows `description` visually but never puts it in aria-describedby.
    const descriptionId = decisionDescriptionId(option.value)
    const describedBy = [error ? errorId : null, descriptionId].filter(Boolean).join(' ')

    return (
        <Radio
            value={option.value}
            label={option.title}
            description={<span id={descriptionId}>{option.description}</span>}
            styles={RADIO_STYLES}
            error={!!error}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            data-testid={option.testId}
        />
    )
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
    const errorId = fieldErrorId(DECISION_GROUP_ID)

    // Boolean `error` restyles the circles without a second message (message is in FieldErrorBox).
    // aria-* also belongs here: submit-time focus lands on the inputs, and Radio.Group would
    // forward unknown props onto a roleless wrapper.
    const radioOptions = options.map((option) => (
        <DecisionRadioOption key={option.value} option={option} error={error} errorId={errorId} />
    ))

    return (
        // Mantine consumes Radio.Group's `id` for internal ids and never renders it, so
        // focusFirstInvalid targets this wrapper instead.
        <Box id={DECISION_GROUP_ID}>
            {/* Not Radio.Group's error prop: FieldErrorBox with isLive always mounts a node, which
                Mantine treats as permanently invalid. */}
            <Box mb={error ? 'lg' : undefined}>
                <FieldErrorBox fieldId={DECISION_GROUP_ID} error={error} isLive />
            </Box>
            {/* Blur is a bubbled focusout, so moving between radios would validate a still-empty
                group; useWidgetBlur waits for the user to leave it. */}
            <Radio.Group
                value={value ?? ''}
                onChange={handleChange}
                {...widgetBlur}
                name="code-review-decision"
                labelProps={{ id: SECTION_HEADING_ID }}
            >
                <Stack gap="md">{radioOptions}</Stack>
            </Radio.Group>
        </Box>
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
                <Group gap="xxs" align="center">
                    <Text id={SECTION_HEADING_ID} fz={20} fw={fontWeight.bold} c={semanticColor('text.primary')}>
                        Decision
                    </Text>
                    <RequiredIndicator fz={20} fw={fontWeight.bold} />
                </Group>
                <Divider />
                <FeedbackIntro labName={labName} />
                <FeedbackEditor feedback={feedback} studyId={studyId} jobId={jobId} />
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
