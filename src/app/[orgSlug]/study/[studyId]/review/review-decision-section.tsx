'use client'

import { Box, Radio, Stack, Text, VisuallyHidden } from '@mantine/core'
import { InputError } from '@/components/errors'
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

    const errorNode = decision.error ? <InputError error={decision.error} /> : undefined

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
                name="review-decision"
                label={<VisuallyHidden>Decision</VisuallyHidden>}
                styles={{ label: { position: 'absolute' }, error: { marginBottom: 24 } }}
                error={errorNode}
                inputWrapperOrder={['label', 'description', 'error', 'input']}
            >
                <Stack gap="md">{radioOptions}</Stack>
            </Radio.Group>
        </Box>
    )
}
