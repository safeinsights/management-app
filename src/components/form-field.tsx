import { type FC, type FocusEvent, type ReactNode, useRef } from 'react'
import { Box, Group, Input } from '@mantine/core'
import { useClickOutside } from '@mantine/hooks'
import { InputError } from '@/components/errors'
import { errorToString } from '@/lib/errors'

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
const formFieldLabelStyles = {
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
 * The field's error message, in the box {@link fieldErrorId} names and `aria-describedby`
 * points at. Null when clean, so whatever shares the slot (an editor footer's save indicator)
 * keeps the row's left edge. `error` is `unknown` because call sites hold anything from a
 * form-validation string to a thrown server error; `errorToString` normalizes it.
 */
export const FieldErrorBox: FC<{ fieldId: string; error?: unknown }> = ({ fieldId, error }) => {
    if (!error) return null
    return (
        <Box id={fieldErrorId(fieldId)}>
            <InputError error={errorToString(error)} />
        </Box>
    )
}

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

export interface WidgetBlurProps<T extends HTMLElement> {
    /** Attach to the widget root. Scopes the click-outside listener to it. */
    ref: React.RefObject<T | null>
    onFocus: () => void
    onBlur: (event: FocusEvent<T>) => void
}

export interface WidgetBlurOptions {
    /**
     * Called on every outside press; return true to let this one pass without validating.
     *
     * For widgets that can move under the pointer. The press signal cannot tell "left the field"
     * from "aimed at the widget and it moved first", because both are a press landing outside it.
     * The widget itself can, since it knows when its own layout shifted, so the decision lives with
     * the caller rather than as a guess in here (OTTER-647). The widget stays visited, so the next
     * genuine departure still validates.
     */
    isSettling?: () => boolean
}

/**
 * Fires `onLeave` once the user has visited a composite widget and then moved on.
 *
 * Composite widgets (Lexical editor plus toolbar, pills plus their remove buttons, a radio
 * group's radios) emit blur as focus moves *between* their internal parts, because React's
 * `onBlur` is `focusout` and bubbles. Validating on those flashes an error mid-interaction, so
 * "moved on" has to be read from two separate signals rather than from blur alone:
 *
 * - **Pointer.** `useClickOutside` listens on `mousedown` / `touchstart` scoped to {@link
 *   WidgetBlurProps.ref}, so the press target decides. A press inside the widget never reaches
 *   the handler, which is what fixes the toolbar case (OTTER-647): Lexical re-renders the surface
 *   holding the caret, dropping focus to `<body>` with a null `relatedTarget` even though the
 *   user is still writing. Reading that off the focus event is guesswork; reading it off the
 *   press is not. The converse is that the press alone decides, so any outside press counts once
 *   the widget has been visited, including ones that never move focus: a touch-scroll of the
 *   page, or a drag-select starting on neutral space. That can surface the error on an empty
 *   required editor mid-read, and in `research-interests-input` it commits the pending pill.
 *   Accepted deliberately, because the alternative is to re-couple the press to a focus check,
 *   which is where the null `relatedTarget` ambiguity came from.
 * - **Keyboard.** `onBlur` handles Tab, which produces no press at all. A non-null
 *   `relatedTarget` outside the widget is unambiguous, so that is the only case it acts on.
 *   A null `relatedTarget` is left to the pointer signal, which also means switching tab or
 *   window no longer needs a `document.hasFocus()` probe: no press, no validation.
 *
 *   Escape is the one keyboard exit deliberately *not* covered. `EscapeFocusPlugin` blurs the
 *   editor root without moving focus anywhere, so it arrives as a null `relatedTarget` with no
 *   press behind it and is deferred to the next signal. Acting on it here would mean either
 *   validating every null `relatedTarget` (the OTTER-647 bug) or probing `document.activeElement`
 *   a tick later, and a bare Escape handler would be worse still: the widgets that do not blur on
 *   Escape (radio groups, `PinInput`, pills) would flash a required error with the caret still
 *   inside them. The error still surfaces on the next outside press, or on submit.
 *
 * `onFocus` gates both. Without it an outside press would validate every widget on the page,
 * including ones the user has not reached yet, and the required error would appear on the first
 * click anywhere.
 *
 * Deliberately not `useFocusWithin`: its containment check treats a null `relatedTarget` as
 * having left, which is the exact bug above.
 */
export function useWidgetBlur<T extends HTMLElement = HTMLDivElement>(
    onLeave?: () => void,
    { isSettling }: WidgetBlurOptions = {},
): WidgetBlurProps<T> {
    const visited = useRef(false)

    const leave = () => {
        if (!visited.current) return
        visited.current = false
        onLeave?.()
    }

    const pressedOutside = () => {
        // Stays visited: a press the widget cannot vouch for is deferred, not forgiven.
        if (isSettling?.()) return
        leave()
    }

    const ref = useClickOutside<T>(pressedOutside)

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
