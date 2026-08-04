import React from 'react'
import { Input, Text, Title } from '@mantine/core'
import { RequiredIndicator } from './required-indicator'

/**
 * Mantine-compliant, accessible label for form fields.
 * - Uses Mantine's Input.Label for proper htmlFor/id linkage.
 * - Keeps original design: bold, small, red asterisk for required.
 * - Accepts className and style for further customization.
 */
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
            <Text fw={600} size="sm" span>
                {label}
                <RequiredIndicator isVisible={required} />
            </Text>
        )
    }
    //Style labels for optional fields
    if (variant === 'optional') {
        labelContent = (
            <Title order={5} fw={550} style={{ overflowWrap: 'normal', display: 'inline', margin: 0 }}>
                {label}
                <RequiredIndicator isVisible={required} />
            </Title>
        )
    } else {
        // 600, not `fw="semibold"`: that is not a valid CSS font-weight keyword, so it was dropped
        // and the label fell back to the h5 default of 500. Fields already moved to `FormField`
        // (`labelProps: { fw: 600 }`) then sat beside these at a different weight (OTTER-647).
        labelContent = (
            <Title order={5} fw={600} style={{ overflowWrap: 'normal', display: 'inline', margin: 0 }}>
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
