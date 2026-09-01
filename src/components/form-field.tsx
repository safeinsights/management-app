import { type FC, type FocusEvent, type ReactNode, useRef } from 'react'
import { Box, Group, Input } from '@mantine/core'
import { useClickOutside } from '@mantine/hooks'
import { InputError } from '@/components/errors'
import { errorToString } from '@/lib/errors'

const formFieldLabelStyles = {
    labelProps: { fw: 600, fz: 'sm' },
    styles: {
        // OTTER-691: Mantine adds no gap under a label, so set it here.
        label: { marginBottom: 4 },
        description: { marginBottom: 'var(--mantine-spacing-xs)' },
    },
} as const

export const fieldErrorId = (inputId: string) => `${inputId}-error`
export const fieldDescriptionId = (inputId: string) => `${inputId}-description`
export const fieldCounterId = (inputId: string) => `${inputId}-counter`
/**
 * Names the field's root so a test can say which field a node belongs to.
 *
 * Several fields on one page render identical-looking nodes: a save indicator, a character
 * counter, a required message. Counting them proves only that the right number exist, which a
 * pair of cross-wired call sites satisfies just as well as correct ones (OTTER-748). Scoping the
 * query to this root is what tells the two apart.
 */
export const fieldTestId = (inputId: string) => `form-field-${inputId}`

interface FieldState {
    hasError: boolean
    hasDescription: boolean
    hasCounter?: boolean
}

export const fieldDescribedBy = (inputId: string, { hasError, hasDescription, hasCounter }: FieldState) =>
    [
        hasError ? fieldErrorId(inputId) : null,
        hasDescription ? fieldDescriptionId(inputId) : null,
        hasCounter ? fieldCounterId(inputId) : null,
    ]
        .filter(Boolean)
        .join(' ') || undefined

// `isLive` (OTTER-737) keeps the box mounted while empty: a live region inserted at the same
// moment as its text is unreliably announced.
export const FieldErrorBox: FC<{ fieldId: string; error?: unknown; isLive?: boolean }> = ({
    fieldId,
    error,
    isLive,
}) => {
    const message = error ? <InputError error={errorToString(error)} /> : null

    if (isLive) {
        return (
            <Box id={fieldErrorId(fieldId)} aria-live="polite">
                {message}
            </Box>
        )
    }

    if (!message) return null
    return <Box id={fieldErrorId(fieldId)}>{message}</Box>
}

// Mantine inputs render their own `Input.Wrapper`, whose `aria-describedby` overwrites any
// hand-passed one, so the association has to be computed by that inner wrapper (OTTER-737).
export const nativeFieldProps = (
    error: ReactNode,
    {
        required = false,
        description,
        describedBy,
    }: { required?: boolean; description?: ReactNode; describedBy?: string } = {},
) => ({
    error,
    // Truthy only so the inner wrapper folds the description id into `describedBy`; it is
    // never rendered (see inputWrapperOrder).
    description: describedBy || description,
    ...(describedBy ? { descriptionProps: { id: describedBy } } : {}),
    // `aria-required` rather than `required`, to keep native browser validation UI from
    // competing with Mantine's messages.
    'aria-required': required || undefined,
    // Mantine types this prop as mutable, so `as const` would not assign.
    inputWrapperOrder: ['input'] as ('input' | 'error' | 'label' | 'description')[],
})

interface ValidatableForm {
    errors: Record<string, unknown>
    validateField: (path: string) => unknown
}

// Skips validation while an error is showing: `validateField` would clear a server rejection
// set with `setFieldError` that the client cannot re-derive.
export function revalidateOnBlur(form: ValidatableForm, path: string) {
    return () => {
        if (form.errors[path]) return
        form.validateField(path)
    }
}

export interface WidgetBlurProps<T extends HTMLElement> {
    ref: React.RefObject<T | null>
    onFocus: () => void
    onBlur: (event: FocusEvent<T>) => void
}

// Blur alone cannot decide a leave: Lexical drops focus to `<body>` with a null `relatedTarget`
// mid-edit (OTTER-647), so nulls defer to `useClickOutside`'s press signal.
export function useWidgetBlur<T extends HTMLElement = HTMLDivElement>(onLeave?: () => void): WidgetBlurProps<T> {
    const visited = useRef(false)

    const leave = () => {
        if (!visited.current) return
        visited.current = false
        onLeave?.()
    }

    const ref = useClickOutside<T>(leave)

    return {
        ref,
        onFocus: () => {
            visited.current = true
        },
        onBlur: (event: FocusEvent<T>) => {
            const next = event.relatedTarget
            if (!next || event.currentTarget.contains(next)) return
            leave()
        },
    }
}

export interface FormFieldProps {
    inputId: string
    label: string
    required?: boolean
    description?: ReactNode
    error?: ReactNode
    /** Right-aligned slot beside the error message: word counters, save-status indicators. */
    footer?: ReactNode
    /** Only for a field whose error can appear while the user is still typing in it (OTTER-690). */
    errorLive?: boolean
    children: ReactNode
}

const FieldErrorSlot: FC<{ inputId: string; error?: ReactNode; errorLive?: boolean }> = ({
    inputId,
    error,
    errorLive,
}) => {
    const message = error ? <Input.Error id={fieldErrorId(inputId)}>{error}</Input.Error> : null

    // Polite, never assertive: a character-limit message re-fires on every keystroke past the
    // cap, and an assertive region would interrupt the user mid-word.
    if (errorLive) return <Box aria-live="polite">{message}</Box>

    return message
}

const FieldFooterRow: FC<{ inputId: string; error?: ReactNode; footer?: ReactNode; errorLive?: boolean }> = ({
    inputId,
    error,
    footer,
    errorLive,
}) => {
    // `errorLive` keeps the row mounted: the live region has to exist before the message does.
    if (!error && !footer && !errorLive) return null

    return (
        <Group justify={error ? 'space-between' : 'flex-end'} align="flex-start" gap="xs" mt={4} wrap="nowrap">
            <FieldErrorSlot inputId={inputId} error={error} errorLive={errorLive} />
            {footer}
        </Group>
    )
}

export const FormField: FC<FormFieldProps> = ({
    inputId,
    label,
    required = false,
    description,
    error,
    footer,
    errorLive,
    children,
}) => {
    return (
        <Box data-testid={fieldTestId(inputId)}>
            <Input.Wrapper
                id={inputId}
                label={label}
                withAsterisk={required}
                description={description}
                descriptionProps={{ id: fieldDescriptionId(inputId) }}
                // ARIA only: omitting 'error' from inputWrapperOrder keeps the visible message in
                // FieldFooterRow beside the counter rather than rendered twice.
                error={error}
                errorProps={{ id: fieldErrorId(inputId) }}
                inputWrapperOrder={['label', 'description', 'input']}
                {...formFieldLabelStyles}
            >
                {children}
            </Input.Wrapper>
            <FieldFooterRow inputId={inputId} error={error} footer={footer} errorLive={errorLive} />
        </Box>
    )
}
