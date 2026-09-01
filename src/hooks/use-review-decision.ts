import { useField } from '@mantine/form'
import type { Decision } from '@/lib/review-decision'

// `useField` rather than plain state so an untouched radio group raises a visible error instead of
// only disabling Submit (OTTER-647).
export function useReviewDecision() {
    // No `validateOnBlur`: Mantine reads it only from `useField`'s own `getInputProps`, which this
    // hook does not use; consumers wire blur through the exposed `onBlur` instead.
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
