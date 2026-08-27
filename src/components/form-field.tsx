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
    styles: {
        // OTTER-691 asks for white space between a field's title and its guidance text, on every
        // input field. Mantine adds none of its own: `getInputOffsets` only reacts to a description
        // or an error sitting above the input, and ignores the label entirely, so the two lines
        // render flush. 4px is Spacing/xxs in the design system.
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
    /**
     * Whether a {@link CharacterCounter} carrying {@link fieldCounterId} sits under the field. The
     * card requires the count to be reachable from the control it belongs to, not merely visible
     * beside it (OTTER-737).
     */
    hasCounter?: boolean
}

/** Space-joined ids of the nodes describing a field, for `aria-describedby`. */
export const fieldDescribedBy = (inputId: string, { hasError, hasDescription, hasCounter }: FieldState) =>
    [
        hasError ? fieldErrorId(inputId) : null,
        hasDescription ? fieldDescriptionId(inputId) : null,
        hasCounter ? fieldCounterId(inputId) : null,
    ]
        .filter(Boolean)
        .join(' ') || undefined

/**
 * The field's error message, in the box {@link fieldErrorId} names and `aria-describedby`
 * points at. Null when clean, so whatever shares the slot (an editor footer's save indicator)
 * keeps the row's left edge. `error` is `unknown` because call sites hold anything from a
 * form-validation string to a thrown server error; `errorToString` normalizes it.
 *
 * `isLive` is for a field whose error can appear while the user is still typing in it, which is
 * otherwise silent: the character-limit message on every capped field (OTTER-737). The box then
 * stays mounted and empty rather than arriving with its content, because a live region inserted at
 * the same moment as its text is unreliably announced. Polite, never assertive: the message can
 * re-fire on every keystroke past the cap, and an assertive region would interrupt mid-word.
 */
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
 *
 * `describedBy` is how anything beyond the description reaches a native input, the character
 * counter above all (OTTER-737). The wrapper folds exactly one description id into its
 * `describedBy`, taken from `descriptionProps.id`, and renders no description element of its own
 * (see `inputWrapperOrder`), so that id is only ever referenced, never applied to a node: a
 * space-separated list passes straight through and no element ends up holding an id with a space in
 * it. Build it with {@link fieldDescribedBy} and `hasError: false`, since Mantine contributes the
 * error id itself.
 */
export const nativeFieldProps = (
    error: ReactNode,
    {
        required = false,
        description,
        describedBy,
    }: { required?: boolean; description?: ReactNode; describedBy?: string } = {},
) => ({
    error,
    // Passed only so the inner wrapper folds the description id into `describedBy`; it is not
    // rendered (see inputWrapperOrder), and its generated id matches FormField's own because
    // both derive from the same `id`. Without it the input announces the error but not the
    // guidance text sitting right above it. A supplied `describedBy` implies it: the wrapper
    // ignores the description slot entirely unless this prop is truthy.
    description: describedBy || description,
    ...(describedBy ? { descriptionProps: { id: describedBy } } : {}),
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
    /**
     * Announce the message whenever it appears, not only when focus reaches the control.
     *
     * Off by default, deliberately: most fields here raise their error on blur or on submit,
     * where the user is already being moved to the control, and a live region on every field
     * would have a screen reader read messages the user is about to hear anyway. Turn it on for
     * a field whose error can appear while the user is still typing in it, which is otherwise
     * silent (the Step 1 study title's character-limit error, OTTER-690).
     */
    errorLive?: boolean
    children: ReactNode
}

/**
 * The message itself. Kept in a container that is always mounted when `errorLive` is set:
 * a live region inserted at the same moment as its content is unreliably announced, so the
 * region has to exist before the error does.
 */
const FieldErrorSlot: FC<{ inputId: string; error?: ReactNode; errorLive?: boolean }> = ({
    inputId,
    error,
    errorLive,
}) => {
    const message = error ? <Input.Error id={fieldErrorId(inputId)}>{error}</Input.Error> : null

    // Polite, never assertive: a character-limit message can re-fire on every keystroke past the
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
    // `errorLive` keeps the row mounted on its own: FieldErrorSlot's live region has to exist
    // before the message does, and a row that appears with the error would defeat that.
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
            <FieldFooterRow inputId={inputId} error={error} footer={footer} errorLive={errorLive} />
        </Box>
    )
}
