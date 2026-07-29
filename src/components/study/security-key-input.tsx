import { Textarea, type TextareaProps } from '@mantine/core'

type SecurityKeyInputProps = Omit<TextareaProps, 'autoComplete' | 'aria-required'>

export const SecurityKeyInput = (props: SecurityKeyInputProps) => (
    <Textarea
        autoComplete="off"
        aria-required
        styles={{ input: { minHeight: 72, borderColor: 'var(--mantine-color-blue-7)' } }}
        maw={800}
        {...props}
    />
)
