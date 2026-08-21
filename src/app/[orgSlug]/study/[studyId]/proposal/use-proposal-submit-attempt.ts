'use client'

import { useCallback } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { type UseFormReturnType } from '@mantine/form'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { FIELD_ID_TO_FORM_PATH, ORDERED_FIELD_IDS } from './field-ids'
import { type ProposalFormValues } from './schema'

/**
 * The Submit button's click behavior (OTTER-691), mirroring Step 1's `useSetupForm`.
 *
 * The button is never disabled on validity, so clicking it is what surfaces the errors. That makes
 * this the only place the page validates as a whole.
 */
export function useProposalSubmitAttempt(form: UseFormReturnType<ProposalFormValues>) {
    const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    // Flags every problem at once rather than stopping at the first: the user should see the full
    // set on one click, even though focus can only land on one of them. The errors object read here
    // is the one `validate()` returns, not `form.errors`, so the decision cannot race the state
    // update that populates it.
    const attemptSubmit = useCallback(() => {
        const { hasErrors, errors } = form.validate()

        if (hasErrors) {
            focusFirstInvalid(ORDERED_FIELD_IDS, (fieldId) => !!errors[FIELD_ID_TO_FORM_PATH[fieldId]])
            return
        }

        openConfirm()
    }, [form, openConfirm])

    return { attemptSubmit, isConfirmOpen, closeConfirm }
}
