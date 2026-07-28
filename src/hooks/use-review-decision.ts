import { useField } from '@mantine/form'
import type { Decision } from '@/lib/review-decision'

/**
 * Required review decision. Backed by `useField` rather than plain state so leaving the
 * radio group untouched raises a visible error instead of only disabling Submit
 * (OTTER-647). `selected` / `onSelect` are unchanged for existing callers.
 */
export function useReviewDecision() {
    // No `validateOnBlur`: Mantine reads that option only inside `useField`'s own
    // `getInputProps`, which this hook does not use. Blur validation is wired by the consumer
    // through the exposed `onBlur`, so the option would imply wiring that does not exist.
    const field = useField<Decision | null>({
        initialValue: null,
        validate: (value) => (value === null ? 'Select a decision to continue.' : null),
    })

    return {
        selected: field.getValue(),
        onSelect: (next: Decision) => field.setValue(next),
        onBlur: field.validate,
        error: field.error,
    }
}
