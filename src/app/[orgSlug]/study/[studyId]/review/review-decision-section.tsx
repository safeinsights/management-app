'use client'

import { Box, Radio, Stack, Text, VisuallyHidden } from '@mantine/core'
import type { useReviewDecision } from '@/hooks/use-review-decision'
import type { Decision } from '@/lib/review-decision'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import { useWidgetBlur } from '@/components/form-field'
import type { StudyForReview } from './review-types'
import { buildDecisionOptions } from './review-types'

type ReviewDecisionSectionProps = {
    decision: ReturnType<typeof useReviewDecision>
    study: StudyForReview
    labName: string
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

    // Radio.Group's context carries value/onChange/size/name/disabled to its children but not
    // `error`, so the circles stay grey while the group's message turns red. A boolean `error`
    // applies Mantine's error styling without adding a second message (OTTER-647).
    const radioOptions = buildDecisionOptions(labName).map((option) => (
        <Radio
            key={option.value}
            value={option.value}
            label={option.label}
            description={
                <Text component="span" size="sm" c="grey.7">
                    {option.description}
                </Text>
            }
            styles={RADIO_STYLES}
            error={!!decision.error}
        />
    ))

    return (
        <Box data-testid="review-decision-section">
            {/* Blur is a bubbled focusout, so moving between radios would validate a still
                empty group; useWidgetBlur waits for the user to leave it (OTTER-647). */}
            {/* The group's name is required by AT but is not drawn in the design, so the label is
                visually hidden rather than dropped. A real `label`, not `aria-label`: Radio.Group
                names the element carrying role="radiogroup" from its rendered label, and strands a
                hand-passed `aria-label` on the roleless outer wrapper. */}
            <Radio.Group
                value={decision.selected ?? ''}
                onChange={handleChange}
                {...widgetBlur}
                name="review-decision"
                label={<VisuallyHidden>Decision</VisuallyHidden>}
                error={decision.error}
            >
                <Stack gap="md">{radioOptions}</Stack>
            </Radio.Group>
        </Box>
    )
}
