'use client'

import { FC } from 'react'
import { Box, Divider, Group, List, Paper, Radio, Stack, Text, VisuallyHidden } from '@mantine/core'
import { InputError } from '@/components/errors'
import { Editor } from '@/components/editable-text/editor'
import { RequiredIndicator } from '@/components/required-indicator'
import { CharacterCounter } from '@/components/character-counter'
import { fieldCounterId, fieldDescribedBy, fieldErrorId } from '@/components/form-field'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'
import { outputsReviewFeedbackDocName } from '@/lib/collaboration-documents'
import { OUTPUTS_FEEDBACK_MAX_CHARACTERS, type OutputsDecision } from '@/lib/outputs-review'

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

// Worded as "nothing that can be shared" rather than "no output files": the branch is also
// reached by jobs holding files this screen cannot offer (OTTER-524).
const noOutputsShareHint = (labName: string) => `There is nothing from this run that can be shared with ${labName}.`

// A real <ul> so a screen reader announces "list, 2 items" rather than a run-on sentence.
const DecisionIntro: FC<{ labName: string; canShareOutputs: boolean }> = ({ labName, canShareOutputs }) => {
    // With nothing shareable the two-branch guidance would describe a choice the reviewer does
    // not have.
    if (!canShareOutputs) {
        return (
            <Text component="div" fz={16} c="charcoal.9">
                Sharing outputs is not available for this run. Describe what happened in your feedback so {labName} can
                revise the code.
            </Text>
        )
    }
    return (
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
}

type DecisionOption = { value: OutputsDecision; title: string; description: string; disabled: boolean }

// Disabled rather than removed, so the reviewer can see why only one option is selectable.
const buildDecisionOptions = (labName: string, canShareOutputs: boolean): DecisionOption[] => [
    {
        value: 'share-outputs',
        title: 'Share outputs and feedback',
        description: canShareOutputs
            ? `Share the output files and your feedback with ${labName}.`
            : noOutputsShareHint(labName),
        disabled: !canShareOutputs,
    },
    {
        value: 'share-feedback-only',
        title: 'Share feedback only',
        description: canShareOutputs
            ? 'Share your feedback without sharing the output files. Choose this if the outputs contain sensitive or restricted information.'
            : `Share your feedback with ${labName} so they can revise the code.`,
        disabled: false,
    },
]

const RADIO_STYLES = { label: { fontWeight: 600, fontSize: 16 }, description: { fontSize: 14 } }

type DecisionRadioGroupProps = {
    value: OutputsDecision | null
    onChange: (next: OutputsDecision) => void
    error: string | undefined
    labName: string
    canShareOutputs: boolean
}

const descriptionId = (value: OutputsDecision) => `outputs-decision-${value}-description`

const DecisionRadioGroup: FC<DecisionRadioGroupProps> = ({ value, onChange, error, labName, canShareOutputs }) => {
    // Mantine renders `description` for sighted users but never puts it in `aria-describedby`,
    // and passes nothing through to the radiogroup element, leaving the inputs the only
    // reachable target for `aria-invalid` (OTTER-675).
    const options = buildDecisionOptions(labName, canShareOutputs).map((option) => (
        <Radio
            key={option.value}
            value={option.value}
            label={option.title}
            description={<span id={descriptionId(option.value)}>{option.description}</span>}
            aria-describedby={descriptionId(option.value)}
            aria-invalid={error ? true : undefined}
            disabled={option.disabled}
            styles={RADIO_STYLES}
            data-testid={`outputs-decision-${option.value}`}
        />
    ))

    // InputError renders null for a falsy error, but the element itself is truthy and Mantine
    // treats any error node as "this field is invalid".
    const errorNode = error ? <InputError error={error} /> : undefined

    return (
        // Mantine consumes Radio.Group's `id` to derive internal ids and never renders it, so
        // the submit-time focus jump would find nothing (see focusFirstInvalid).
        <Box id={DECISION_GROUP_ID}>
            {/* No blur validation: the message renders above the options, so raising it on blur
                would push the navigation row down mid-click. */}
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

// Rendered through the Editor's own `footerRight` slot: a second SaveStatusIndicator here would
// show two "All changes saved" messages in collaborative mode.
const FeedbackCounter: FC<{ characterCount: number }> = ({ characterCount }) => (
    <CharacterCounter
        id={fieldCounterId(FEEDBACK_INPUT_ID)}
        count={characterCount}
        maxCharacters={OUTPUTS_FEEDBACK_MAX_CHARACTERS}
    />
)

// Polite, not assertive: the over-limit message fires on every keystroke past the cap.
const FeedbackError: FC<{ error: string | undefined }> = ({ error }) => (
    <Box id={fieldErrorId(FEEDBACK_INPUT_ID)} aria-live="polite">
        <InputError error={error} />
    </Box>
)

export type OutputsDecisionSectionProps = {
    jobId: string
    studyId: string
    labName: string
    characterCount: number
    feedbackError: string | undefined
    onFeedbackChange: (json: string) => void
    selected: OutputsDecision | null
    onSelect: (next: OutputsDecision) => void
    decisionError: string | undefined
    /** False when the run produced no artifacts, so sharing them is not an option (OTTER-524). */
    canShareOutputs?: boolean
}

export const OutputsDecisionSection: FC<OutputsDecisionSectionProps> = ({
    jobId,
    studyId,
    labName,
    characterCount,
    feedbackError,
    onFeedbackChange,
    selected,
    onSelect,
    decisionError,
    canShareOutputs = true,
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
                <DecisionIntro labName={labName} canShareOutputs={canShareOutputs} />
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
                        hasDescription: false,
                        hasCounter: true,
                    })}
                    skeletonHeight={EDITOR_SKELETON_HEIGHT}
                    footerRight={<FeedbackCounter characterCount={characterCount} />}
                />
                <FeedbackError error={feedbackError} />
                <DecisionRadioGroup
                    value={selected}
                    onChange={onSelect}
                    error={decisionError}
                    labName={labName}
                    canShareOutputs={canShareOutputs}
                />
            </Stack>
        </Paper>
    )
}
