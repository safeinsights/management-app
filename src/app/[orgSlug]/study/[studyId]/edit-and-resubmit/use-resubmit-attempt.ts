'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { type UseFormReturnType } from '@mantine/form'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { FIELD_ID_TO_FORM_PATH, ORDERED_FIELD_IDS } from '@/app/[orgSlug]/study/[studyId]/proposal/field-ids'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { RESUBMISSION_NOTE_FIELD_ID, type ResubmitNoteValue } from './schema'

// Page order: the proposal fields, then the feedback thread, then the note. The two forms share no
// wrapper whose positions could be compared, so the order is spelled out here.
export const RESUBMIT_ORDERED_FIELD_IDS: string[] = [...ORDERED_FIELD_IDS, RESUBMISSION_NOTE_FIELD_ID]

interface Args {
    form: UseFormReturnType<ProposalFormValues>
    noteForm: UseFormReturnType<ResubmitNoteValue>
    isSubmitting: boolean
}

// The button is never disabled on validity, so clicking it is what surfaces the errors and this
// is the only place the page validates as a whole (OTTER-762, after OTTER-691).
export function useResubmitAttempt({ form, noteForm, isSubmitting }: Args) {
    const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    // The modal stays mounted for the whole mutation so it can render its loading state; a
    // success navigates away, so this only fires on failure.
    const wasSubmitting = useRef(false)
    useEffect(() => {
        if (wasSubmitting.current && !isSubmitting) closeConfirm()
        wasSubmitting.current = isSubmitting
    }, [isSubmitting, closeConfirm])

    // Reads the errors validate() returns rather than form.errors, so the decision cannot race
    // the state update that populates them.
    const attemptResubmit = useCallback(() => {
        const proposal = form.validate()
        const note = noteForm.validate()

        if (proposal.hasErrors || note.hasErrors) {
            focusFirstInvalid(RESUBMIT_ORDERED_FIELD_IDS, (fieldId) =>
                fieldId === RESUBMISSION_NOTE_FIELD_ID
                    ? !!note.errors[RESUBMISSION_NOTE_FIELD_ID]
                    : !!proposal.errors[FIELD_ID_TO_FORM_PATH[fieldId]],
            )
            return
        }

        openConfirm()
    }, [form, noteForm, openConfirm])

    return { attemptResubmit, isConfirmOpen, closeConfirm }
}
