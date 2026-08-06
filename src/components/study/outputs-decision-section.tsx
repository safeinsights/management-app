'use client'

import { FC } from 'react'
import { Box, Divider, Group, List, Paper, Radio, Stack, Text, VisuallyHidden } from '@mantine/core'
import { InputError } from '@/components/errors'
import { Editor } from '@/components/editable-text/editor'
import { RequiredIndicator } from '@/components/required-indicator'
import { WordCounter } from '@/components/word-counter'
import { fieldDescribedBy, fieldDescriptionId, fieldErrorId } from '@/components/form-field'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { outputsReviewFeedbackDocName } from '@/lib/collaboration-documents'
import type { OutputsDecision } from '@/lib/outputs-review'

export const FEEDBACK_INPUT_ID = 'outputs-decision-feedback'
export const DECISION_GROUP_ID = 'outputs-decision-options'

const EDITOR_SKELETON_HEIGHT = 260

const contentStyle = {
    minHeight: 260,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '14px',
    lineHeight: 1.6,
} as const

// A real <ul>, not "<br />•": the two clauses are a list, and a screen reader should announce them
// as one ("list, 2 items") rather than as a single run-on sentence with stray bullet characters.
const DecisionIntro: FC<{ labName: string }> = ({ labName }) => (
    <Text component="div" fz={16} c="charcoal.9">
        Based on your review:
        <List spacing={4} size="md" pt={4}>
            <List.Item>
                If the outputs contain sensitive or restricted information, do not share them. Describe the issue in
                your feedback so {labName} can revise the code.
            </List.Item>
            <List.Item>If they do not, share the outputs along with your feedback.</List.Item>
        </List>
    </Text>
)

type DecisionOption = { value: OutputsDecision; title: string; description: string }

const buildDecisionOptions = (labName: string): DecisionOption[] => [
    {
        value: 'share-outputs',
        title: 'Share outputs and feedback',
        description: `Share the output files and your feedback with ${labName}.`,
    },
    {
        value: 'share-feedback-only',
        title: 'Share feedback only',
        description:
            'Share your feedback without sharing the output files. Choose this if the outputs contain sensitive or restricted information.',
    },
]

const RADIO_STYLES = { label: { fontWeight: 600, fontSize: 16 }, description: { fontSize: 14 } }

type DecisionRadioGroupProps = {
    value: OutputsDecision | null
    onChange: (next: OutputsDecision) => void
    error: string | undefined
    labName: string
}

const descriptionId = (value: OutputsDecision) => `outputs-decision-${value}-description`

const DecisionRadioGroup: FC<DecisionRadioGroupProps> = ({ value, onChange, error, labName }) => {
    // Mantine's Radio renders a native <input type="radio">; Radio.Group gives them a shared
    // `name`, so mutual exclusivity and arrow-key navigation are the browser's, not simulated.
    //
    // The description is wrapped in an element we own so it can be referenced by
    // `aria-describedby`: Mantine renders `description` for sighted users but never associates it
    // with the input, so without this a screen reader announces only the title and the user never
    // hears which option withholds the files.
    //
    // `aria-invalid` sits on the inputs rather than on the `role="radiogroup"` element, which is
    // where the group's invalid state belongs: Mantine renders that element itself, inside
    // Radio.Group, and passes nothing through to it, so the inputs are the only reachable target.
    // Without it the group was flagged visually and via `aria-describedby` but never announced as
    // invalid, unlike the feedback editor right above it (OTTER-675).
    const options = buildDecisionOptions(labName).map((option) => (
        <Radio
            key={option.value}
            value={option.value}
            label={option.title}
            description={<span id={descriptionId(option.value)}>{option.description}</span>}
            aria-describedby={descriptionId(option.value)}
            aria-invalid={error ? true : undefined}
            styles={RADIO_STYLES}
            data-testid={`outputs-decision-${option.value}`}
        />
    ))

    // Guarded rather than passed unconditionally: InputError renders null for a falsy error, but
    // the element itself is truthy, and Mantine treats any error node as "this field is invalid".
    const errorNode = error ? <InputError error={error} /> : undefined

    return (
        // The id lives on this wrapper, not on Radio.Group: Mantine consumes an `id` prop to derive
        // its internal label/error ids and never renders it on an element, so
        // document.getElementById would find nothing and the submit-time focus jump would silently
        // do nothing (see focusFirstInvalid).
        <Box id={DECISION_GROUP_ID}>
            {/* No blur validation: the message renders above the options, so raising it as focus
                leaves the group would push the navigation row down mid-click and cost the reviewer
                the click that caused it (see useOutputsDecision).
                The group's name is required by AT but is not drawn in the design, so the label is
                visually hidden rather than dropped.
                inputWrapperOrder moves the message above the options, where the design puts it;
                Mantine's default order would render it under the last description. */}
            <Radio.Group
                value={value ?? ''}
                onChange={(next) => onChange(next as OutputsDecision)}
                name="outputs-decision"
                label={<VisuallyHidden>Sharing decision</VisuallyHidden>}
                error={errorNode}
                inputWrapperOrder={['label', 'description', 'error', 'input']}
            >
                <Stack gap="md">{options}</Stack>
            </Radio.Group>
        </Box>
    )
}

// Carries the description id so the count reaches the editor's aria-describedby. Rendered through
// the Editor's own `footerRight` slot, beside the save indicator the editor already draws. A
// second SaveStatusIndicator here would show the user two "All changes saved" messages in
// collaborative mode, and could contradict the error below when validation fails.
const FeedbackCounter: FC<{ wordCount: number; maxWords: number }> = ({ wordCount, maxWords }) => (
    <Box id={fieldDescriptionId(FEEDBACK_INPUT_ID)}>
        <WordCounter wordCount={wordCount} maxWords={maxWords} unit="words" />
    </Box>
)

// Polite, not assertive: the over-limit message can fire on every keystroke past the cap, and an
// assertive region would interrupt the user mid-sentence.
const FeedbackError: FC<{ error: string | undefined }> = ({ error }) => (
    <Box id={fieldErrorId(FEEDBACK_INPUT_ID)} aria-live="polite">
        <InputError error={error} />
    </Box>
)

export type OutputsDecisionSectionProps = {
    jobId: string
    studyId: string
    labName: string
    maxWords: number
    wordCount: number
    feedbackError: string | undefined
    onFeedbackChange: (json: string) => void
    selected: OutputsDecision | null
    onSelect: (next: OutputsDecision) => void
    decisionError: string | undefined
}

export const OutputsDecisionSection: FC<OutputsDecisionSectionProps> = ({
    jobId,
    studyId,
    labName,
    maxWords,
    wordCount,
    feedbackError,
    onFeedbackChange,
    selected,
    onSelect,
    decisionError,
}) => {
    const websocketProvider = useYjsWebsocket()

    return (
        <Paper p="xxl" data-testid="outputs-decision-section">
            <Stack gap="lg">
                <Group gap={0} align="center">
                    <Text fz={20} fw={700} c="charcoal.9">
                        Decision
                    </Text>
                    <RequiredIndicator fz={20} fw={700} />
                </Group>
                <Divider color="charcoal.1" />
                <DecisionIntro labName={labName} />
                <Editor
                    id={outputsReviewFeedbackDocName(jobId)}
                    inputId={FEEDBACK_INPUT_ID}
                    studyId={studyId}
                    websocketProvider={websocketProvider}
                    contentStyle={contentStyle}
                    onChange={onFeedbackChange}
                    error={feedbackError}
                    ariaLabel="Decision feedback"
                    ariaRequired
                    ariaDescribedBy={fieldDescribedBy(FEEDBACK_INPUT_ID, {
                        hasError: !!feedbackError,
                        hasDescription: true,
                    })}
                    skeletonHeight={EDITOR_SKELETON_HEIGHT}
                    footerRight={<FeedbackCounter wordCount={wordCount} maxWords={maxWords} />}
                />
                <FeedbackError error={feedbackError} />
                <DecisionRadioGroup value={selected} onChange={onSelect} error={decisionError} labName={labName} />
            </Stack>
        </Paper>
    )
}
