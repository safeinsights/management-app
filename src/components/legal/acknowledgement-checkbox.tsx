'use client'

import { InputError } from '@/components/errors'
import { Checkbox, Text } from '@mantine/core'
import { FC, ReactNode, useId } from 'react'
import { fontWeight } from '@/theme/tokens'

type AcknowledgeProps = {
    label: string | ReactNode
    checked: boolean
    onChange: (checked: boolean) => void
    /** Fires when the box loses focus, so leaving it unchecked can be flagged (OTTER-647). */
    onBlur?: () => void
    error?: ReactNode
}

export const AcknowledgementCheckbox: FC<AcknowledgeProps> = ({ label, checked, onChange, onBlur, error }) => {
    const errorId = useId()
    if (!label) return null

    return (
        <Checkbox
            checked={checked}
            onChange={(event) => onChange(event.currentTarget.checked)}
            onBlur={onBlur}
            label={
                <Text span fz="sm" fw={fontWeight.bold}>
                    {label}
                </Text>
            }
            error={
                error ? (
                    <span id={errorId}>
                        <InputError error={error} />
                    </span>
                ) : undefined
            }
            // Hand-wire `aria-invalid` and `aria-describedby` errors for accessibility
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
        />
    )
}
