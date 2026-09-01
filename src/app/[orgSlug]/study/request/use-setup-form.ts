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
}

export function useSetupForm({ form, isTitleLocked, isOrgLocked, isLanguageLocked }: UseSetupFormArgs) {
    // The form is uncontrolled, so reading form.values during render would freeze the counter.
    const [titleValue, setTitleValue] = useState(form.getValues().title ?? '')
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

        openConfirm()
    }, [form, visibleFieldIds, openConfirm])

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
