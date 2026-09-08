'use client'

import { Paper, Radio, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import type { useReviewDecision } from '@/hooks/use-review-decision'
import type { Decision } from '@/lib/review-decision'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import { useWidgetBlur } from '@/components/form-field'
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
    return (
        <DecisionPanel
            decision={decision}
            labName={labName}
            isVisible={!isSubmittedProposalReviewStatus(study.status)}
        />
    )
}

type DecisionPanelProps = Omit<ReviewDecisionSectionProps, 'study'> & { isVisible: boolean }

function DecisionPanel({ decision, labName, isVisible }: DecisionPanelProps) {
    const widgetBlur = useWidgetBlur(decision.onBlur)

    if (!isVisible) return null

    const handleChange = (value: string) => {
        decision.onSelect(value as Decision)
    }

    // Radio.Group's context does not carry `error` to its children, so a boolean `error` restyles
    // the circles without a second message (OTTER-647).
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
                empty group; useWidgetBlur waits for the user to leave it (OTTER-647). */}
            {/* A real `label`, not `aria-label`: Radio.Group names role="radiogroup" from its
                rendered label and strands `aria-label` on the roleless outer wrapper. */}
            <Radio.Group
                value={decision.selected ?? ''}
                onChange={handleChange}
                {...widgetBlur}
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
