'use client'

import { FC } from 'react'
import { Box, Divider, Group, List, Paper, Radio, Stack, Text, VisuallyHidden } from '@mantine/core'
import { InputError } from '@/components/errors'
import { Editor } from '@/components/editable-text/editor'
import { RequiredIndicator } from '@/components/required-indicator'
import { CharacterCounter } from '@/components/character-counter'
import { fieldCounterId, fieldDescribedBy, FieldErrorBox } from '@/components/form-field'
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

// OTTER-524: a run can fail before producing anything a reviewer can open, and the reviewer still has
// to close the round out. The decision therefore stands, but sharing is impossible. Everything below
// that reads `canShareOutputs` exists to say that plainly instead of offering a choice that cannot be
// honored.
//
// Worded as "nothing here that can be shared" rather than "there are no output files": the branch is
// also reached by a job holding files this screen cannot offer, and claiming they do not exist would
// contradict the banner above, which says an error log was recorded. Three shapes reach it: a
// submission-time scan log, an error log stored in a form no key opens, and a pre-#764 job whose
// results are plaintext APPROVED-* rows the reviewer flow has never been able to share.
const noOutputsShareHint = (labName: string) => `There is nothing from this run that can be shared with ${labName}.`

// A real <ul>, not "<br />•": the two clauses are a list, and a screen reader should announce them
// as one ("list, 2 items") rather than as a single run-on sentence with stray bullet characters.
const DecisionIntro: FC<{ labName: string; canShareOutputs: boolean }> = ({ labName, canShareOutputs }) => {
    // With nothing shareable there is no judgment to make about contents, so the two-branch guidance
    // would be describing a choice the reviewer does not have. States what this screen can do rather
    // than what the run produced, which is the one thing that is true for every shape reaching here.
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

// Disabled rather than removed: keeping both options visible is what lets the reviewer see why only
// one is selectable. Dropping the row would read as the option having silently disappeared.
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

// Carries the counter id so the count reaches the editor's aria-describedby. No SaveStatusIndicator
// here: the editor draws one already, and a second would both duplicate it and contradict the error
// sharing its row.
const FeedbackCounter: FC<{ characterCount: number }> = ({ characterCount }) => (
    <CharacterCounter
        id={fieldCounterId(FEEDBACK_INPUT_ID)}
        count={characterCount}
        maxCharacters={OUTPUTS_FEEDBACK_MAX_CHARACTERS}
    />
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
                    // Takes the slot the save indicator vacates, not a row below the counter.
                    footerLeft={<FieldErrorBox fieldId={FEEDBACK_INPUT_ID} error={feedbackError} isLive />}
                    footerRight={<FeedbackCounter characterCount={characterCount} />}
                />
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
