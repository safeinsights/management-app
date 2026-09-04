'use client'

import { countCharacters } from '@/lib/field-limits'
import { useCallback, useState, type ChangeEvent } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { UseFormReturnType } from '@mantine/form'
import { focusFirstInvalid } from '@/lib/focus-first-invalid'
import { STUDY_TITLE_MAX_CHARACTERS, STUDY_TITLE_OVER_LIMIT_ERROR, type StudyProposalFormValues } from './form-schemas'
import { FIELD_ID_TO_FORM_PATH, LANGUAGE_FIELD_ID, ORG_SELECT_ID, TITLE_INPUT_ID } from './fields/field-ids'

export interface SetupFormLocks {
    isTitleLocked: boolean
    isOrgLocked: boolean
    isLanguageLocked: boolean
}

interface UseSetupFormArgs extends SetupFormLocks {
    form: UseFormReturnType<StudyProposalFormValues>
    /**
     * The persisted title. The context fills the form from the draft in an effect, so without this
     * the first paint reads an empty box and heads the page "Untitled study" (OTTER-619).
     */
    initialTitle?: string
    /**
     * True only on the first visit. The modal's warning is that the Data Partner and the language
     * cannot be changed after this step, so by the time the researcher navigates back to a persisted
     * draft there is nothing left to warn about and a valid click proceeds straight away (OTTER-764).
     */
    requiresConfirmation: boolean
    /** Runs on a valid click when no confirmation is required. */
    onProceed: () => void
}

export function useSetupForm({
    form,
    initialTitle,
    isTitleLocked,
    isOrgLocked,
    isLanguageLocked,
    requiresConfirmation,
    onProceed,
}: UseSetupFormArgs) {
    // The form is uncontrolled, so reading form.values during render would freeze the counter.
    const [titleValue, setTitleValue] = useState(form.getValues().title || initialTitle || '')
    form.watch('title', ({ value }) => setTitleValue(value ?? ''))

    const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    // Only the over-limit half of the rule is live; the blank rule belongs to blur and Continue,
    // so clearing the box does not flash an error mid-edit.
    const onTitleChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const raw = event.currentTarget.value
            form.setFieldValue('title', raw)
            if (countCharacters(raw) > STUDY_TITLE_MAX_CHARACTERS) {
                form.setFieldError('title', STUDY_TITLE_OVER_LIMIT_ERROR)
            }
        },
        [form],
    )

    const onTitleBlur = useCallback(() => form.validateField('title'), [form])

    // Rebuilt per click: the language field is absent until a partner is chosen and a locked
    // field has nothing focusable, so a stale id would leave the click looking dead.
    const visibleFieldIds = useCallback(() => {
        const ids: string[] = []
        if (!isTitleLocked) ids.push(TITLE_INPUT_ID)
        if (!isOrgLocked) ids.push(ORG_SELECT_ID)
        if (!isLanguageLocked && form.getValues().orgSlug) ids.push(LANGUAGE_FIELD_ID)
        return ids
    }, [form, isTitleLocked, isOrgLocked, isLanguageLocked])

    // Gated on "did a field the user can act on fail", not schema-wide hasErrors: a locked field
    // has no error slot, so gating on it is the OTTER-647 dead button.
    const attemptContinue = useCallback(() => {
        const { errors } = form.validate()

        const invalidFieldId = focusFirstInvalid(visibleFieldIds(), (fieldId) => {
            const path = FIELD_ID_TO_FORM_PATH[fieldId as keyof typeof FIELD_ID_TO_FORM_PATH]
            return !!errors[path]
        })

        if (invalidFieldId) return

        if (requiresConfirmation) {
            openConfirm()
            return
        }

        onProceed()
    }, [form, visibleFieldIds, openConfirm, requiresConfirmation, onProceed])

    return {
        titleValue,
        titleError: form.errors.title as string | undefined,
        onTitleChange,
        onTitleBlur,
        attemptContinue,
        isConfirmOpen,
        closeConfirm,
    }
}
