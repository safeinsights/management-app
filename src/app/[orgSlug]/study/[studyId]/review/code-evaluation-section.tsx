'use client'

import { type ReactNode } from 'react'
import { Alert, Divider, Group, Paper, Radio, Stack, Text } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { RequiredIndicator } from '@/components/required-indicator'
import { widgetBlurHandler } from '@/components/form-field'
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
    error: ReactNode
    onChange: (value: CodeReviewCriteriaDraftValue) => void
    onBlur: () => void
}

function CriterionRow({ descriptor, value, error, onChange, onBlur }: CriterionRowProps) {
    const handleChange = (raw: string) => {
        onChange(raw as CodeReviewCriteriaDraftValue)
    }
    const radioOptions = OPTIONS.map((option) => <Radio key={option.value} value={option.value} label={option.label} />)

    // Radio.Group strands a hand-passed `aria-label` on its outer wrapper, which carries no role.
    // The element with role="radiogroup" takes its name from `labelProps.id`, so pointing that at
    // the visible criterion text is what actually names the group. Without it every row is an
    // unnamed radiogroup and a screen reader cannot say which criterion is being answered.
    const labelId = `criteria-${descriptor.key}-label`

    return (
        <Group gap="xl" wrap="nowrap" align="flex-start" data-testid={`criteria-row-${descriptor.key}`}>
            <Text id={labelId} fz={14} w={320}>
                {descriptor.label}
            </Text>
            {/* Guarded blur: the radios are siblings, so an unguarded handler would error
                while the user is still tabbing across this row's options (OTTER-647). */}
            <Radio.Group
                value={value ?? ''}
                onChange={handleChange}
                onBlur={widgetBlurHandler(onBlur)}
                name={`criteria-${descriptor.key}`}
                error={error}
                labelProps={{ id: labelId }}
            >
                <Group gap="xl" wrap="nowrap">
                    {radioOptions}
                </Group>
            </Radio.Group>
        </Group>
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
            error={form.errors[`criteria.${descriptor.key}`]}
            onChange={handleChange(descriptor.key)}
            onBlur={() => form.validateField(`criteria.${descriptor.key}`)}
        />
    ))

    return (
        <Paper p="xxl" data-testid="code-evaluation-section">
            <Stack gap="lg">
                <Group gap={4} align="center">
                    <Text fz={20} fw={700} c="charcoal.9">
                        Code evaluation
                    </Text>
                    <RequiredIndicator fz={20} fw={700} />
                </Group>
                <Divider />
                <Text fz={14} c="charcoal.9">
                    Use this checklist to guide your review. Consider each criterion based on the submitted code, AI
                    summary, and security scan results.
                </Text>
                <Alert
                    color="red"
                    variant="light"
                    title="Attention"
                    icon={<WarningCircleIcon size={20} weight="fill" color="var(--mantine-color-red-9)" />}
                    styles={{ title: { color: 'var(--mantine-color-red-9)' } }}
                    data-testid="code-evaluation-attention"
                >
                    This checklist is provided as guidance. As the reviewer(s), you are responsible for the final
                    decision based on your professional judgment and understanding of your data.
                </Alert>
                <Text fz={16} fw={700} c="charcoal.9">
                    Evaluation criteria
                </Text>
                <Stack gap="md">{criterionRows}</Stack>
            </Stack>
        </Paper>
    )
}
