import { type ReactNode } from 'react'
import { Radio, type RadioProps } from '@mantine/core'

export const DECISION_RADIO_STYLES = {
    label: { fontWeight: 600, fontSize: 16 },
    description: { fontSize: 14 },
}

const descriptionSpanId = (value: string) => `decision-radio-${value}-description`

export type DecisionRadioProps = {
    value: string
    label: string
    description?: ReactNode
    testId?: string
    error?: ReactNode
    errorId?: string
} & Omit<RadioProps, 'value' | 'label' | 'description' | 'error'>

export function DecisionRadio({ value, label, description, testId, error, errorId, ...rest }: DecisionRadioProps) {
    const descId = description ? descriptionSpanId(value) : null
    const describedBy = [error ? errorId : null, descId].filter(Boolean).join(' ') || undefined

    return (
        <Radio
            value={value}
            label={label}
            description={descId ? <span id={descId}>{description}</span> : undefined}
            error={!!error}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            data-testid={testId}
            {...rest}
        />
    )
}
