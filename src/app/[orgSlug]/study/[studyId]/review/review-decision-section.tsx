import { Paper, Radio, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import type { useReviewDecision } from '@/hooks/use-review-decision'
import type { Decision } from '@/lib/review-decision'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import { widgetBlurHandler } from '@/components/form-field'
import type { DecisionOption, StudyForReview } from './review-types'
import { DECISION_OPTIONS } from './review-types'

type ReviewDecisionSectionProps = {
    decision: ReturnType<typeof useReviewDecision>
    study: StudyForReview
    labName: string
}

function OptionDescription({ option }: { option: DecisionOption }): ReactNode {
    if (!option.warning) {
        return (
            <Text component="span" size="sm" c="grey.7">
                {option.description}
            </Text>
        )
    }
    return (
        <Text component="span" size="sm" c="grey.7">
            {option.description}{' '}
            <Text component="span" size="sm" c="grey.7" fw={600}>
                {option.warning}
            </Text>
        </Text>
    )
}

const RADIO_STYLES = {
    label: { fontWeight: 600, fontSize: 16 },
    description: { fontSize: 14 },
}

export function ReviewDecisionSection({ decision, study, labName }: ReviewDecisionSectionProps) {
    if (isSubmittedProposalReviewStatus(study.status)) {
        return null
    }

    const handleChange = (value: string) => {
        decision.onSelect(value as Decision)
    }

    // Radio.Group's context carries value/onChange/size/name/disabled to its children but not
    // `error`, so the circles stay grey while the group's message turns red. A boolean `error`
    // applies Mantine's error styling without adding a second message (OTTER-647).
    const radioOptions = DECISION_OPTIONS.map((option) => (
        <Radio
            key={option.value}
            value={option.value}
            label={option.label}
            description={<OptionDescription option={option} />}
            disabled={option.disabled}
            styles={RADIO_STYLES}
            error={!!decision.error}
        />
    ))

    return (
        <Paper p="xl" data-testid="review-decision-section">
            <Text size="md" mb="md">
                Select a decision for this initial request. Your feedback and decision will be shared with the{' '}
                <Text component="span" fw={600}>
                    {labName}
                </Text>
                . If approved, the researcher will proceed to sign legal agreements and submit their code for your
                review.
            </Text>
            {/* Blur is a bubbled focusout, so moving between radios would validate a still
                empty group; widgetBlurHandler waits for focus to leave it (OTTER-647). */}
            {/* A real `label`, not `aria-label`: Radio.Group names the element carrying
                role="radiogroup" from its rendered label, and strands a hand-passed `aria-label`
                on the roleless outer wrapper. Using the prop also makes `withAsterisk` render,
                which is the group's only visible required marker. */}
            <Radio.Group
                value={decision.selected ?? ''}
                onChange={handleChange}
                onBlur={widgetBlurHandler(decision.onBlur)}
                name="review-decision"
                label="Initial request decision"
                labelProps={{ fw: 600 }}
                withAsterisk
                error={decision.error}
            >
                <Stack gap="md" mt="xs">
                    {radioOptions}
                </Stack>
            </Radio.Group>
        </Paper>
    )
}
