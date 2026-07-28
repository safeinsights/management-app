import { type FC, type ReactNode } from 'react'
import { Box, Group, Input, Text } from '@mantine/core'

/**
 * Chrome (label / description / error) for controls that Mantine's own inputs cannot
 * provide it for. Built on `Input.Wrapper` so label-for, `aria-describedby` and the
 * required asterisk are wired by Mantine rather than by hand.
 *
 * Pick the pattern that matches the control (OTTER-647):
 *
 * - **Standard Mantine input** (`TextInput`, `Select`, `MultiSelect`): wrap it here for the
 *   label and description, and spread {@link nativeFieldProps} onto the input. Those controls
 *   render their own `Input.Wrapper`, whose context shadows this one, so the error node has to
 *   reach the input directly or its `aria-describedby` is lost.
 * - **Composite widget** whose focusable element is not the labeled node (the Lexical
 *   `Editor`): wrap it here and pass {@link fieldDescribedBy} to whatever prop the control
 *   exposes for it. The `Editor` takes Lexical-style `ariaDescribedBy`, not `aria-*` keys.
 * - **A control that already owns its chrome** (`Radio.Group`, `PillsInput`, `PinInput`): do
 *   not wrap it. Pass `label` / `withAsterisk` / `error` straight through and let Mantine wire
 *   the association itself.
 *
 * `error` must be a node, not a boolean: Mantine only renders the message and only adds
 * it to `aria-describedby` for non-boolean values.
 */

/**
 * Matches the label and description spacing the app used before `Input.Wrapper` (bold small
 * label, red asterisk, and a gap under the guidance text that Mantine does not add itself).
 */
export const formFieldLabelStyles = {
    labelProps: { fw: 600, fz: 'sm' },
    styles: { description: { marginBottom: 'var(--mantine-spacing-xs)' } },
} as const

export const fieldErrorId = (inputId: string) => `${inputId}-error`
export const fieldDescriptionId = (inputId: string) => `${inputId}-description`

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
 * wrapper's context, spread after the caller's props, so a hand-passed `aria-describedby` is
 * silently overwritten. Passing the error node to the input instead lets its own wrapper
 * compute the association, and `inputWrapperOrder` stops it rendering a second copy of the
 * message, which {@link FormField} already shows beside the counter.
 *
 * The ids line up because the inner wrapper derives its error id from the same `id`:
 * `${inputId}-error`, which is what `FormField` labels its message with.
 */
export const nativeFieldProps = (
    error: ReactNode,
    { required = false, description }: { required?: boolean; description?: ReactNode } = {},
) => ({
    error,
    // Passed only so the inner wrapper folds the description id into `describedBy`; it is not
    // rendered (see inputWrapperOrder), and its generated id matches FormField's own because
    // both derive from the same `id`. Without it the input announces the error but not the
    // guidance text sitting right above it.
    description,
    // `withAsterisk` on FormField is visual only, so the required state has to reach the
    // control itself. `aria-required` rather than `required`, to avoid native browser
    // validation UI competing with Mantine's messages.
    'aria-required': required || undefined,
    // Mutable array: Mantine types this prop as mutable, so `as const` would not assign.
    inputWrapperOrder: ['input'] as ('input' | 'error' | 'label' | 'description')[],
})

interface ValidatableForm {
    errors: Record<string, unknown>
    validateField: (path: string) => unknown
}

/**
 * Validates a field on blur, but never when an error is already showing.
 *
 * `validateField` clears the error when the client rule passes, which would erase a message
 * the client cannot re-derive: a server rejection set with `setFieldError` (Clerk's "invalid
 * code", "invalid phone number", a rate-limit notice). Re-reading that message and tabbing
 * away would silently wipe it, leaving an unchanged value with no explanation.
 *
 * Skipping is safe because Mantine's `clearInputErrorOnChange` (on by default) drops the error
 * as soon as the user edits the value, so the next blur validates a clean field again.
 */
export function revalidateOnBlur(form: ValidatableForm, path: string) {
    return () => {
        if (form.errors[path]) return
        form.validateField(path)
    }
}

/**
 * Wraps a blur callback so it fires only when focus leaves the whole widget.
 *
 * Composite widgets (Lexical editor plus toolbar, pills plus their remove buttons, a radio
 * group's radios) emit blur as focus moves *between* their internal parts, because React's
 * `onBlur` is `focusout` and bubbles. Validating on those flashes an error mid-interaction.
 *
 * A null `relatedTarget` is ambiguous and must not be treated as "still inside". It happens
 * both when the user clicks a non-focusable part of the page (whitespace, a heading, body
 * text), which IS them moving on and must validate, and when the tab or window loses focus,
 * which is not. `document.hasFocus()` separates the two: it stays true for an in-page click
 * and goes false when the document itself is no longer focused.
 *
 * Getting this wrong silently defeats the feature: clicking neutral space is the commonest way
 * to leave a field, so skipping it means the required error never appears at all.
 */
export function widgetBlurHandler(onLeave: (event: React.FocusEvent<HTMLElement>) => void) {
    return (event: React.FocusEvent<HTMLElement>) => {
        const next = event.relatedTarget as Node | null

        if (!next) {
            if (typeof document !== 'undefined' && !document.hasFocus()) return
            onLeave(event)
            return
        }

        if (event.currentTarget.contains(next)) return
        onLeave(event)
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
     * Right-aligned slot beside the error message: word counters, save-status indicators.
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
