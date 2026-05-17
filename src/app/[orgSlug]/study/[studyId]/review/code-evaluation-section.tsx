'use client'

import { Button, Divider, Group, Paper, Radio, Stack, Text } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { useCodeReviewFeedbackProvider } from '@/lib/realtime/code-review-feedback-provider-context'
import {
    type CodeReviewCriteriaDraft,
    type CodeReviewCriteriaDraftValue,
    type CodeReviewCriteriaKey,
    useCodeReviewEvaluationMap,
} from '@/hooks/use-code-review-evaluation-map'
import { CODE_REVIEW_CRITERIA, type CodeReviewCriterion } from './code-review-criteria'

const OPTIONS: readonly { value: 'yes' | 'no' | 'not-sure'; label: string }[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'not-sure', label: 'Not sure' },
]

type CodeEvaluationSectionProps = {
    form: UseFormReturnType<{ criteria: CodeReviewCriteriaDraft }>
    enabled: boolean
}

type CriterionRowProps = {
    descriptor: CodeReviewCriterion
    value: CodeReviewCriteriaDraftValue
    onChange: (value: CodeReviewCriteriaDraftValue) => void
}

type ClearCriterionButtonProps = {
    isVisible: boolean
    onClear: () => void
    testId: string
}

// Native radios cannot be returned to the unchecked state by re-clicking the
// selected option (MDN: only form reset or programmatic change can do that), so
// the criteria UI cannot satisfy the cross-peer unselect requirement without an
// explicit clear affordance.
function ClearCriterionButton({ isVisible, onClear, testId }: ClearCriterionButtonProps) {
    if (!isVisible) return null
    return (
        <Button variant="subtle" size="xs" onClick={onClear} data-testid={testId}>
            Clear
        </Button>
    )
}

function CriterionRow({ descriptor, value, onChange }: CriterionRowProps) {
    const handleChange = (raw: string) => {
        onChange(raw as CodeReviewCriteriaDraftValue)
    }
    const handleClear = () => onChange(null)
    const radioOptions = OPTIONS.map((option) => <Radio key={option.value} value={option.value} label={option.label} />)

    return (
        <Stack gap={4}>
            <Text fz={14} fw={600}>
                {descriptor.label}
            </Text>
            <Text fz={14} c="charcoal.7">
                {descriptor.description}
            </Text>
            <Radio.Group value={value ?? ''} onChange={handleChange} name={`criteria-${descriptor.key}`}>
                <Group gap="lg" mt="xs">
                    {radioOptions}
                    <ClearCriterionButton
                        isVisible={value !== null}
                        onClear={handleClear}
                        testId={`criteria-clear-${descriptor.key}`}
                    />
                </Group>
            </Radio.Group>
        </Stack>
    )
}

export function CodeEvaluationSection({ form, enabled }: CodeEvaluationSectionProps) {
    const provider = useCodeReviewFeedbackProvider()
    const { pushCriterion } = useCodeReviewEvaluationMap({ form, provider, enabled })

    const criteriaValues = form.getValues().criteria

    const handleChange = (key: CodeReviewCriteriaKey) => (value: CodeReviewCriteriaDraftValue) => {
        form.setFieldValue(`criteria.${key}`, value)
        pushCriterion(key, value)
    }

    const criterionRows = CODE_REVIEW_CRITERIA.map((descriptor) => (
        <CriterionRow
            key={descriptor.key}
            descriptor={descriptor}
            value={criteriaValues[descriptor.key]}
            onChange={handleChange(descriptor.key)}
        />
    ))

    return (
        <Paper p="xxl" data-testid="code-evaluation-section">
            <Stack gap="lg">
                <Text fz={20} fw={700} c="charcoal.9">
                    Code evaluation
                </Text>
                <Divider />
                <Stack gap="lg">{criterionRows}</Stack>
            </Stack>
        </Paper>
    )
}
