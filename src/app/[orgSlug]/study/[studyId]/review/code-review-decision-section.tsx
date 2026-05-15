'use client'

import type { useCodeReviewDecision } from '@/hooks/use-code-review-decision'
import type { CodeDecision } from '@/lib/code-review'
import { Divider, Radio, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { CODE_DECISION_OPTIONS, type CodeDecisionOption } from './code-review-types'

type CodeReviewDecisionSectionProps = {
    decision: ReturnType<typeof useCodeReviewDecision>
    labName: string
}

const RADIO_STYLES = {
    label: { fontWeight: 600, fontSize: 16 },
    description: { fontSize: 14 },
}

function spliceLabName(text: string, labName: string): string {
    return text.replaceAll('{researchLab}', labName)
}

// Mantine's Radio.description renders inside a <p>, so children must be valid
// phrasing content (no <div> or nested <p>). Use spans with display="block" to
// stack the warning under the description without violating HTML nesting rules.
function OptionDescription({ option, labName }: { option: CodeDecisionOption; labName: string }): ReactNode {
    const description = spliceLabName(option.description, labName)
    if (!option.warning) {
        return (
            <Text component="span" size="sm" c="grey.7">
                {description}
            </Text>
        )
    }
    return (
        <Text component="span" size="sm" c="grey.7">
            {description}
            <Text component="span" display="block" size="sm" c="charcoal.7" fw={600} mt={4}>
                {option.warning}
            </Text>
        </Text>
    )
}

export function CodeReviewDecisionSection({ decision, labName }: CodeReviewDecisionSectionProps) {
    const handleChange = (value: string) => {
        decision.onSelect(value as CodeDecision)
    }

    return (
        <Stack gap="md" data-testid="code-review-decision-section">
            <Divider />
            <Text size="md">
                Select a decision for this code submission. Your feedback and decision will be shared with the {labName}
                .
            </Text>
            <Radio.Group value={decision.selected ?? ''} onChange={handleChange} name="code-review-decision">
                <Stack gap="md" mt="xs">
                    {CODE_DECISION_OPTIONS.map((option) => (
                        <Radio
                            key={option.value}
                            value={option.value}
                            label={option.label}
                            description={<OptionDescription option={option} labName={labName} />}
                            styles={RADIO_STYLES}
                        />
                    ))}
                </Stack>
            </Radio.Group>
        </Stack>
    )
}
