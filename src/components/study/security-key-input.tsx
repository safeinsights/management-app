import { Textarea, type TextareaProps } from '@mantine/core'
import { forwardRef } from 'react'

type SecurityKeyInputProps = Omit<TextareaProps, 'autoComplete' | 'aria-required' | 'aria-label'>

export const SecurityKeyInput = forwardRef<HTMLTextAreaElement, SecurityKeyInputProps>(
    ({ error, disabled, ...props }, ref) => (
        <Textarea
            ref={ref}
            autoComplete="off"
            aria-required
            aria-label="Security key"
            disabled={disabled}
            error={error ? <span role="alert">{error}</span> : undefined}
            styles={{ input: { minHeight: 72 } }}
            w="75%"
            {...props}
        />
    ),
)

SecurityKeyInput.displayName = 'SecurityKeyInput'
