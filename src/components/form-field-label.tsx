import React from 'react'
import { Input, Text, Title } from '@mantine/core'
import { RequiredIndicator } from './required-indicator'
import { fontWeight } from '@/theme/tokens'

export interface FormFieldLabelProps {
    label: string
    required?: boolean
    inputId?: string
    variant?: 'orgset'
}

export const FormFieldLabel: React.FC<FormFieldLabelProps> = ({ label, required = false, inputId, variant }) => {
    const labelContent =
        variant === 'orgset' ? (
            <Text fw={fontWeight.semibold} size="sm" span>
                {label}
                <RequiredIndicator isVisible={required} />
            </Text>
        ) : (
            <Title order={3} size="h5" fw={fontWeight.semibold} display="inline">
                {label}
                <RequiredIndicator isVisible={required} />
            </Title>
        )
    return <Input.Label htmlFor={inputId}>{labelContent}</Input.Label>
}
