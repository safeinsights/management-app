'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { type UseFormReturnType } from '@mantine/form'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { FIELD_ID_TO_FORM_PATH, ORDERED_FIELD_IDS } from './field-ids'
import { type ProposalFormValues } from './schema'

// Reads the errors validate() returns rather than form.errors, so the decision cannot race the
// state update that populates them.
export function invalidProposalFieldIds(form: UseFormReturnType<ProposalFormValues>): Set<string> {
    const { errors } = form.validate()
    return new Set(ORDERED_FIELD_IDS.filter((fieldId) => !!errors[FIELD_ID_TO_FORM_PATH[fieldId]]))
}

interface Args {
    isSubmitting: boolean
    /** Validates every form on the page and returns the DOM ids of the fields that failed. */
    validate: () => Set<string>
    /** Page order of every id `validate` can return; the proposal fields alone by default. */
    orderedFieldIds?: string[]
}

// The button is never disabled on validity, so clicking it is what surfaces the errors and this
// is the only place the page validates as a whole (OTTER-691). The Edit proposal page adds its
// resubmission note through `validate` and `orderedFieldIds` (OTTER-762).
export function useProposalSubmitAttempt({ isSubmitting, validate, orderedFieldIds = ORDERED_FIELD_IDS }: Args) {
    const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    // The modal stays mounted for the whole mutation so it can render its loading state; a
    // success navigates away, so this only fires on failure.
    const wasSubmitting = useRef(false)
    useEffect(() => {
        if (wasSubmitting.current && !isSubmitting) closeConfirm()
        wasSubmitting.current = isSubmitting
    }, [isSubmitting, closeConfirm])

    const attemptSubmit = useCallback(() => {
        const invalid = validate()

        if (invalid.size > 0) {
            focusFirstInvalid(orderedFieldIds, (fieldId) => invalid.has(fieldId))
            return
        }

        openConfirm()
    }, [validate, orderedFieldIds, openConfirm])

    return { attemptSubmit, isConfirmOpen, closeConfirm }
}
