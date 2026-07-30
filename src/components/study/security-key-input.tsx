import { Textarea, type TextareaProps } from '@mantine/core'
import { forwardRef } from 'react'

type SecurityKeyInputProps = Omit<TextareaProps, 'autoComplete' | 'aria-required'>

export const SecurityKeyInput = forwardRef<HTMLTextAreaElement, SecurityKeyInputProps>(
    ({ error, disabled, ...props }, ref) => {
        const borderColor = disabled ? undefined : error ? 'var(--mantine-color-red-7)' : 'var(--mantine-color-blue-7)'

        return (
            <Textarea
                ref={ref}
                autoComplete="off"
                aria-required
                disabled={disabled}
                error={error ? <span role="alert">{error}</span> : undefined}
                styles={{ input: { minHeight: 72, borderColor } }}
                maw={800}
                {...props}
            />
        )
    },
)

SecurityKeyInput.displayName = 'SecurityKeyInput'
