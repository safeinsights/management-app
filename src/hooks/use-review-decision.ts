import { useField } from '@mantine/form'
import type { Decision } from '@/lib/review-decision'

/**
 * Required review decision. Backed by `useField` rather than plain state so leaving the
 * radio group untouched raises a visible error instead of only disabling Submit
 * (OTTER-647). `selected` / `onSelect` are unchanged for existing callers.
 */
export function useReviewDecision() {
    const field = useField<Decision | null>({
        initialValue: null,
        validateOnBlur: true,
        validate: (value) => (value === null ? 'Select a decision to continue.' : null),
    })

    return {
        selected: field.getValue(),
        onSelect: (next: Decision) => field.setValue(next),
        onBlur: field.validate,
        error: field.error,
    }
}
