import { Textarea, type TextareaProps } from '@mantine/core'
import { forwardRef } from 'react'

import { InputError } from '@/components/errors'
import { resizableTextareaProps } from '@/components/textarea-resize'

type SecurityKeyInputProps = Omit<TextareaProps, 'autoComplete' | 'aria-required' | 'aria-label'>

export const SecurityKeyInput = forwardRef<HTMLTextAreaElement, SecurityKeyInputProps>(
    ({ error, disabled, label, ...props }, ref) => (
        <Textarea
            ref={ref}
            autoComplete="off"
            aria-required
            // Cards that draw their own "Security key" heading pass no label, but the field still needs a name.
            aria-label={label ? undefined : 'Security key'}
            label={label}
            disabled={disabled}
            error={
                error ? (
                    <span role="alert">
                        <InputError error={error} />
                    </span>
                ) : undefined
            }
            {...resizableTextareaProps()}
            w="75%"
            {...props}
        />
    ),
)

SecurityKeyInput.displayName = 'SecurityKeyInput'
