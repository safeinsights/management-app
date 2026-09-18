'use client'

import { type ReactNode } from 'react'
import { Alert, Divider, Group, Paper, Radio, Stack, Text } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { ArrowSquareOutIcon, InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { RequiredIndicator } from '@/components/required-indicator'
import { useWidgetBlur } from '@/components/form-field'
import { LinkWithIcon } from '@/components/links'
import { useCodeReviewFeedbackProvider } from '@/lib/realtime/code-review-feedback-provider-context'
import {
    CODE_REVIEW_CRITERIA_KEYS,
    type CodeReviewCriteriaDraft,
    type CodeReviewCriteriaDraftValue,
    type CodeReviewCriteriaKey,
    useCodeReviewEvaluationMap,
} from '@/hooks/use-code-review-evaluation-map'
import { fontWeight, semanticColor } from '@/theme/tokens'

const OPTIONS: readonly { value: 'yes' | 'no' | 'not-sure'; label: string }[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'not-sure', label: 'Not sure' },
]

type CodeEvaluationSectionProps = {
    form: UseFormReturnType<{ criteria: CodeReviewCriteriaDraft }>
    enabled: boolean
    proposalHref: string
}

type CriterionRowProps = {
    criterionKey: CodeReviewCriteriaKey
    value: CodeReviewCriteriaDraftValue
    error: ReactNode
    onChange: (value: CodeReviewCriteriaDraftValue) => void
    onBlur: () => void
    label: ReactNode
}

function CriterionRow({ criterionKey, value, error, onChange, onBlur, label }: CriterionRowProps) {
    const handleChange = (raw: string) => {
        onChange(raw as CodeReviewCriteriaDraftValue)
    }
    const radioOptions = OPTIONS.map((option) => <Radio key={option.value} value={option.value} label={option.label} />)
    const widgetBlur = useWidgetBlur(onBlur)

    // Radio.Group strands a hand-passed aria-label on its roleless outer wrapper; the
    // role="radiogroup" element takes its name from labelProps.id instead.
    const labelId = `criteria-${criterionKey}-label`

    return (
        <Group gap="xl" wrap="nowrap" align="flex-start" data-testid={`criteria-row-${criterionKey}`}>
            <Text id={labelId} fz={14} w={320}>
                {label}
            </Text>
            {/* Guarded blur: the radios are siblings, so an unguarded handler would error while
                the user is still tabbing across the row (OTTER-647). */}
            <Radio.Group
                value={value ?? ''}
                onChange={handleChange}
                {...widgetBlur}
                name={`criteria-${criterionKey}`}
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

function ProposalLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <LinkWithIcon
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            underline="always"
            icon={<ArrowSquareOutIcon size={14} weight="bold" />}
            data-testid="criteria-proposal-link"
        >
            {children}
        </LinkWithIcon>
    )
}

const CRITERION_LABELS: Record<CodeReviewCriteriaKey, (proposalHref: string) => ReactNode> = {
    proposalAlignment: (href) => (
        <>
            Does code align with the approved <ProposalLink href={href}>proposal</ProposalLink>?
        </>
    ),
    agreementCompliance: () => 'Does code align with the Study Agreement?',
    privacyProtection: () => 'Could the outputs expose any PII?',
}

export function CodeEvaluationSection({ form, enabled, proposalHref }: CodeEvaluationSectionProps) {
    const provider = useCodeReviewFeedbackProvider()
    const { pushCriterion } = useCodeReviewEvaluationMap({ form, provider, enabled })

    const criteriaValues = form.getValues().criteria

    const handleChange = (key: CodeReviewCriteriaKey) => (value: CodeReviewCriteriaDraftValue) => {
        form.setFieldValue(`criteria.${key}`, value)
        pushCriterion(key, value)
    }

    const criterionRows = CODE_REVIEW_CRITERIA_KEYS.map((key) => (
        <CriterionRow
            key={key}
            criterionKey={key}
            value={criteriaValues[key]}
            error={form.errors[`criteria.${key}`]}
            onChange={handleChange(key)}
            onBlur={() => form.validateField(`criteria.${key}`)}
            label={CRITERION_LABELS[key](proposalHref)}
        />
    ))

    return (
        <Paper p="xxl" data-testid="code-evaluation-section">
            <Stack gap="lg">
                <Group gap="xxs" align="center">
                    <Text fz={20} fw={fontWeight.bold} c={semanticColor('text.primary')}>
                        Code evaluation
                    </Text>
                    <RequiredIndicator fz={20} fw={fontWeight.bold} />
                </Group>
                <Divider />
                <Alert
                    bg={semanticColor('info.bg.light')}
                    icon={<InfoIcon size={20} weight="fill" color={semanticColor('info.text')} />}
                    data-testid="code-evaluation-attention"
                >
                    This checklist is for guidance only. The final decision is yours, based on your professional
                    judgment along with your organization&apos;s data and policies.
                </Alert>
                <Text fz={16} fw={fontWeight.bold} c={semanticColor('text.primary')}>
                    Evaluation criteria
                </Text>
                <Stack gap="md">{criterionRows}</Stack>
            </Stack>
        </Paper>
    )
}
