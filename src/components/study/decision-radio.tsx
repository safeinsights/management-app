import { type ReactNode } from 'react'
import { Radio, Text, type RadioProps } from '@mantine/core'
import { fontWeight } from '@/theme/tokens'

const descriptionSpanId = (value: string) => `decision-radio-${value}-description`

export type DecisionRadioProps = {
    value: string
    label: string
    description?: ReactNode
    testId?: string
    error?: ReactNode
    errorId?: string
    isProminent?: boolean
} & Omit<RadioProps, 'value' | 'label' | 'description' | 'error'>

export function DecisionRadio({
    value,
    label,
    description,
    testId,
    error,
    errorId,
    isProminent = false,
    ...rest
}: DecisionRadioProps) {
    const descId = description ? descriptionSpanId(value) : null
    const describedBy = [error ? errorId : null, descId].filter(Boolean).join(' ') || undefined

    return (
        <Radio
            value={value}
            label={<DecisionLabel label={label} isProminent={isProminent} />}
            description={
                descId ? (
                    <DecisionDescription id={descId} description={description} isProminent={isProminent} />
                ) : undefined
            }
            error={!!error}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            data-testid={testId}
            {...rest}
        />
    )
}

function DecisionLabel({ label, isProminent }: { label: string; isProminent: boolean }) {
    if (!isProminent) return label

    return (
        <Text span inherit fz="md" fw={fontWeight.semibold}>
            {label}
        </Text>
    )
}

function DecisionDescription({
    id,
    description,
    isProminent,
}: {
    id: string
    description: ReactNode
    isProminent: boolean
}) {
    return (
        <Text span inherit id={id} fz={isProminent ? 'sm' : undefined}>
            {description}
        </Text>
    )
}
