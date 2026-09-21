import React from 'react'
import { Input, Text, Title } from '@mantine/core'
import { RequiredIndicator } from './required-indicator'
import { fontWeight } from '@/theme/tokens'

export interface FormFieldLabelProps {
    label: string
    required?: boolean
    inputId?: string
    variant?: 'orgset' | 'optional'
    className?: string
    style?: React.CSSProperties
}

export const FormFieldLabel: React.FC<FormFieldLabelProps> = ({
    label,
    required = false,
    inputId,
    variant,
    className,
    style,
}) => {
    let labelContent
    if (variant === 'orgset') {
        labelContent = (
            <Text fw={fontWeight.semibold} size="sm" span>
                {label}
                <RequiredIndicator isVisible={required} />
            </Text>
        )
    }
    if (variant === 'optional') {
        labelContent = (
            <Title order={3} size="h5" fw={550} style={{ overflowWrap: 'normal', display: 'inline', margin: 0 }}>
                {label}
                <RequiredIndicator isVisible={required} />
            </Title>
        )
    } else {
        labelContent = (
            <Title
                order={3}
                size="h5"
                fw={fontWeight.semibold}
                style={{ overflowWrap: 'normal', display: 'inline', margin: 0 }}
            >
                {label}
                <RequiredIndicator isVisible={required} />
            </Title>
        )
    }
    return (
        <Input.Label htmlFor={inputId} className={className} style={style}>
            {labelContent}
        </Input.Label>
    )
}
