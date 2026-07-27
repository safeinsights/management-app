import { type FC, type ReactNode } from 'react'
import { Box, Group, Input, Text } from '@mantine/core'

/**
 * Chrome (label / description / error) for controls that Mantine's own inputs cannot
 * provide it for. Built on `Input.Wrapper` so label-for, `aria-describedby` and the
 * required asterisk are wired by Mantine rather than by hand.
 *
 * Pick the pattern that matches the control (OTTER-647):
 *
 * - **Standard Mantine input** (`TextInput`, `Select`, `Textarea`, …) — do NOT use this.
 *   Those already own an `Input.Wrapper`; wrapping again nests two of them. Pass
 *   `label` / `description` / `withAsterisk` / `error` straight to the input, spreading
 *   {@link formFieldLabelStyles} to keep the shared look.
 * - **Raw control** that renders a single focusable element (`PinInput`, `MultiSelect`
 *   without built-in chrome) — wrap it here and give the control the same `inputId`.
 * - **Composite widget** whose focusable element is not the labelled node (Lexical
 *   editor, `PillsInput`, `Radio.Group`) — wrap it here and spread
 *   {@link compositeFieldAria} onto the focusable element.
 *
 * `error` must be a node, not a boolean: Mantine only renders the message and only adds
 * it to `aria-describedby` for non-boolean values.
 */

/** Matches the label typography the app used before `Input.Wrapper` (bold, small, red asterisk). */
export const formFieldLabelStyles = {
    labelProps: { fw: 600, fz: 'sm' },
} as const

export const fieldErrorId = (inputId: string) => `${inputId}-error`
export const fieldDescriptionId = (inputId: string) => `${inputId}-description`
export const fieldLabelId = (inputId: string) => `${inputId}-label`

interface FieldState {
    hasError: boolean
    hasDescription: boolean
}

/** Space-joined ids of the nodes describing a field, for `aria-describedby`. */
export const fieldDescribedBy = (inputId: string, { hasError, hasDescription }: FieldState) =>
    [hasError ? fieldErrorId(inputId) : null, hasDescription ? fieldDescriptionId(inputId) : null]
        .filter(Boolean)
        .join(' ') || undefined

/**
 * Props for a standard Mantine input rendered inside {@link FormField}.
 *
 * `TextInput`, `Select`, `MultiSelect` and friends all resolve to `InputBase`, which always
 * renders its own `Input.Wrapper`, and `Input` then applies `aria-describedby` from *that*
 * wrapper's context — spread after the caller's props, so a hand-passed `aria-describedby` is
 * silently overwritten. Passing the error node to the input instead lets its own wrapper
 * compute the association, and `inputWrapperOrder` stops it rendering a second copy of the
 * message, which {@link FormField} already shows beside the counter.
 *
 * The ids line up because the inner wrapper derives its error id from the same `id`:
 * `${inputId}-error`, which is what `FormField` labels its message with.
 */
export const nativeFieldProps = (error: ReactNode) => ({
    error,
    // Mutable array: Mantine types this prop as mutable, so `as const` would not assign.
    inputWrapperOrder: ['input'] as ('input' | 'error' | 'label' | 'description')[],
})

/**
 * ARIA for a composite widget's focusable element. `Input.Wrapper` links its label with
 * `htmlFor`, which only reliably associates real form controls, so composite widgets point
 * back at the generated ids themselves.
 *
 * For controls taking Lexical-style camelCase aria props (the `Editor`), use
 * {@link fieldDescribedBy} directly instead — they do not accept `aria-*` keys.
 */
export const compositeFieldAria = (inputId: string, state: FieldState) => ({
    'aria-labelledby': fieldLabelId(inputId),
    'aria-describedby': fieldDescribedBy(inputId, state),
    'aria-invalid': state.hasError || undefined,
})

/**
 * Wraps a blur callback so it fires only when focus leaves the whole widget.
 *
 * Composite widgets (Lexical editor + toolbar, pills + their remove buttons, a radio
 * group's radios) emit blur as focus moves *between* their internal parts, because
 * React's `onBlur` is `focusout` and bubbles. Validating on those flashes an error
 * mid-interaction. A null `relatedTarget` means focus left the page entirely (tab or
 * window switch), which is also not the user leaving the field.
 */
export function widgetBlurHandler(onLeave: () => void) {
    return (event: React.FocusEvent<HTMLElement>) => {
        const next = event.relatedTarget as Node | null
        if (!next || event.currentTarget.contains(next)) return
        onLeave()
    }
}

export interface FormFieldProps {
    /** DOM id of the focusable control. Drives every generated ARIA id. */
    inputId: string
    label: string
    required?: boolean
    description?: ReactNode
    error?: ReactNode
    /**
     * Right-aligned slot beside the error message — word counters, save-status indicators.
     * Shares a row with the error so a long message and the counter never collide.
     */
    footer?: ReactNode
    children: ReactNode
}

const FieldFooterRow: FC<{ inputId: string; error?: ReactNode; footer?: ReactNode }> = ({ inputId, error, footer }) => {
    if (!error && !footer) return null

    return (
        <Group justify={error ? 'space-between' : 'flex-end'} align="flex-start" gap="xs" mt={4} wrap="nowrap">
            {error && <Input.Error id={fieldErrorId(inputId)}>{error}</Input.Error>}
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
    children,
}) => {
    return (
        <Box>
            <Input.Wrapper
                id={inputId}
                label={label}
                withAsterisk={required}
                description={description}
                descriptionProps={{ id: fieldDescriptionId(inputId) }}
                // `error` is passed for ARIA only: Input.Wrapper folds the error id into the
                // `describedBy` it publishes on context, which nested Mantine inputs apply as
                // `aria-describedby`. Without it those inputs would carry `aria-invalid` and
                // no reachable message, which is the defect this component exists to remove.
                // Omitting 'error' from inputWrapperOrder keeps Mantine from also rendering
                // it, so the visible message stays in FieldFooterRow beside the counter.
                error={error}
                errorProps={{ id: fieldErrorId(inputId) }}
                inputWrapperOrder={['label', 'description', 'input']}
                {...formFieldLabelStyles}
            >
                {children}
            </Input.Wrapper>
            <FieldFooterRow inputId={inputId} error={error} footer={footer} />
        </Box>
    )
}

/** Standalone description text for controls rendering their own label. */
export const FieldDescription: FC<{ inputId: string; children: ReactNode }> = ({ inputId, children }) => (
    <Text id={fieldDescriptionId(inputId)} size="xs" c="charcoal.7" mb="xs">
        {children}
    </Text>
)
