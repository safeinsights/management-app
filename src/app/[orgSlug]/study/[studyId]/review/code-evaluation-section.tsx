'use client'

import { type ReactNode } from 'react'
import { Alert, Divider, Group, Paper, Radio, Stack, Text } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { ArrowSquareOutIcon, InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { RequiredIndicator } from '@/components/required-indicator'
import { fieldErrorId, FieldErrorBox, useWidgetBlur } from '@/components/form-field'
import { LinkWithIcon } from '@/components/links'
import { useCodeReviewFeedbackProvider } from '@/lib/realtime/code-review-feedback-provider-context'
import {
    CODE_REVIEW_CRITERIA_KEYS,
    type CodeReviewCriteriaDraft,
    type CodeReviewCriteriaDraftValue,
    type CodeReviewCriteriaKey,
    useCodeReviewEvaluationMap,
} from '@/hooks/use-code-review-evaluation-map'
import { CODE_EVALUATION_CRITERIA_ERROR } from '@/lib/proposal-review'
import { fontWeight, semanticColor } from '@/theme/tokens'

const OPTIONS: readonly { value: 'yes' | 'no' | 'not-sure'; label: string }[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'not-sure', label: 'Not sure' },
]

/** Shared with FIELD_ORDER in code-review-client so focus order cannot drift from the DOM. */
export const criterionFieldId = (key: CodeReviewCriteriaKey) => `criteria-${key}`

export const CRITERIA_SECTION_ERROR_ID = 'code-evaluation-criteria'

type CodeEvaluationSectionProps = {
    form: UseFormReturnType<{ criteria: CodeReviewCriteriaDraft }>
    enabled: boolean
    proposalHref: string
    /** False until the first Submit click — untouched rows must not flag themselves. */
    validateOnBlur: boolean
}

type CriterionRowProps = {
    criterionKey: CodeReviewCriteriaKey
    value: CodeReviewCriteriaDraftValue
    error: ReactNode
    sectionErrorId: string
    onChange: (value: CodeReviewCriteriaDraftValue) => void
    onBlur?: () => void
    label: ReactNode
}

function CriterionRadio({
    option,
    error,
    sectionErrorId,
}: {
    option: (typeof OPTIONS)[number]
    error: ReactNode
    sectionErrorId: string
}) {
    return (
        <Radio
            value={option.value}
            label={option.label}
            error={!!error}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? sectionErrorId : undefined}
        />
    )
}

function CriterionRow({ criterionKey, value, error, sectionErrorId, onChange, onBlur, label }: CriterionRowProps) {
    const handleChange = (raw: string) => {
        onChange(raw as CodeReviewCriteriaDraftValue)
    }
    const widgetBlur = useWidgetBlur(onBlur)
    const fieldId = criterionFieldId(criterionKey)

    // Boolean `error` restyles the circles without a second message (message is in FieldErrorBox).
    // aria-* also belongs here: submit-time focus lands on the inputs, and Radio.Group would
    // forward unknown props onto a roleless wrapper.
    const radioOptions = OPTIONS.map((option) => (
        <CriterionRadio key={option.value} option={option} error={error} sectionErrorId={sectionErrorId} />
    ))

    // Radio.Group strands a hand-passed aria-label on its roleless outer wrapper; the
    // role="radiogroup" element takes its name from labelProps.id instead.
    const labelId = `${fieldId}-label`

    return (
        // Mantine consumes Radio.Group's `id` for internal ids and never renders it, so
        // focusFirstInvalid targets this wrapper instead.
        <Group id={fieldId} gap="xl" wrap="nowrap" align="flex-start" data-testid={`criteria-row-${criterionKey}`}>
            <Text id={labelId} fz={14} w={320}>
                {label}
            </Text>
            {/* Blur is a bubbled focusout, so moving between radios would validate a still-empty
                group; useWidgetBlur waits for the user to leave it. */}
            <Radio.Group
                value={value ?? ''}
                onChange={handleChange}
                {...widgetBlur}
                name={fieldId}
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

export function CodeEvaluationSection({ form, enabled, proposalHref, validateOnBlur }: CodeEvaluationSectionProps) {
    const provider = useCodeReviewFeedbackProvider()
    const { pushCriterion } = useCodeReviewEvaluationMap({ form, provider, enabled })

    const criteriaValues = form.getValues().criteria
    const sectionErrorId = fieldErrorId(CRITERIA_SECTION_ERROR_ID)
    const hasCriteriaError = CODE_REVIEW_CRITERIA_KEYS.some((key) => form.errors[`criteria.${key}`])

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
            sectionErrorId={sectionErrorId}
            onChange={handleChange(key)}
            onBlur={validateOnBlur ? () => form.validateField(`criteria.${key}`) : undefined}
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
                {/* gap only when flagged so the empty live region does not open space above the rows. */}
                <Stack gap={hasCriteriaError ? 'lg' : 0}>
                    <FieldErrorBox
                        fieldId={CRITERIA_SECTION_ERROR_ID}
                        error={hasCriteriaError ? CODE_EVALUATION_CRITERIA_ERROR : null}
                        isLive
                    />
                    <Stack gap="md">{criterionRows}</Stack>
                </Stack>
            </Stack>
        </Paper>
    )
}
