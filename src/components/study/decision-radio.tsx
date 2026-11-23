import { type ReactNode } from 'react'
import { Radio, Text, type RadioProps } from '@mantine/core'
import { fontWeight } from '@/theme/tokens'

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
    // Mantine wires the description itself; the shared error message is the only extra reference.
    return (
        <Radio
            value={value}
            label={<DecisionLabel label={label} isProminent={isProminent} />}
            description={
                description ? <DecisionDescription description={description} isProminent={isProminent} /> : undefined
            }
            error={!!error}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
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

function DecisionDescription({ description, isProminent }: { description: ReactNode; isProminent: boolean }) {
    return (
        <Text span inherit fz={isProminent ? 'sm' : undefined}>
            {description}
        </Text>
    )
}
