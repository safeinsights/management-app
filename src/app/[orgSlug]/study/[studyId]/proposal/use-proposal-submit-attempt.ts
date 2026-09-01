'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { type UseFormReturnType } from '@mantine/form'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { FIELD_ID_TO_FORM_PATH, ORDERED_FIELD_IDS } from './field-ids'
import { type ProposalFormValues } from './schema'

// The button is never disabled on validity, so clicking it is what surfaces the errors and this
// is the only place the page validates as a whole (OTTER-691).
export function useProposalSubmitAttempt(form: UseFormReturnType<ProposalFormValues>, isSubmitting: boolean) {
    const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    // The modal stays mounted for the whole mutation so it can render its loading state; a
    // success navigates away, so this only fires on failure.
    const wasSubmitting = useRef(false)
    useEffect(() => {
        if (wasSubmitting.current && !isSubmitting) closeConfirm()
        wasSubmitting.current = isSubmitting
    }, [isSubmitting, closeConfirm])

    // Reads the errors validate() returns rather than form.errors, so the decision cannot race
    // the state update that populates it.
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
