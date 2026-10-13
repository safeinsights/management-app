'use client'

import { Box, Radio, Stack, Text, VisuallyHidden } from '@mantine/core'
import { InputError } from '@/components/errors'
import type { useReviewDecision } from '@/hooks/use-review-decision'
import type { Decision } from '@/lib/review-decision'
import { isSubmittedProposalReviewStatus } from '@/lib/proposal-review'
import { useWidgetBlur } from '@/components/form-field'
import { DecisionRadio } from '@/components/study/decision-radio'
import type { StudyForReview } from './review-types'
import { buildDecisionOptions } from './review-types'
import { semanticColor } from '@/theme/tokens'

type ReviewDecisionSectionProps = {
    decision: ReturnType<typeof useReviewDecision>
    study: StudyForReview
    labName: string
}

export const DECISION_RADIO_NAME = 'review-decision'

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

    const errorNode = decision.error ? <InputError error={decision.error} /> : undefined

    const radioOptions = buildDecisionOptions(labName).map((option) => (
        <DecisionRadio
            key={option.value}
            value={option.value}
            label={option.label}
            isProminent
            description={
                <Text component="span" size="sm" c={semanticColor('text.secondary')}>
                    {option.description}
                </Text>
            }
        />
    ))

    return (
        <Box data-testid="review-decision-section">
            {/* Native blur would fire when moving between radios.
                Radio.Group only names the radiogroup from a rendered label, not aria-label.
                Default inputWrapperOrder puts the error under the last option. */}
            <Radio.Group
                value={decision.selected ?? ''}
                onChange={handleChange}
                {...widgetBlur}
                name={DECISION_RADIO_NAME}
                label={<VisuallyHidden>Decision</VisuallyHidden>}
                // VisuallyHidden clips the text; position:absolute collapses Mantine's wrapper div.
                labelProps={{ pos: 'absolute' }}
                errorProps={{ mb: 'lg' }}
                error={errorNode}
                inputWrapperOrder={['label', 'description', 'error', 'input']}
            >
                <Stack gap="md">{radioOptions}</Stack>
            </Radio.Group>
        </Box>
    )
}
