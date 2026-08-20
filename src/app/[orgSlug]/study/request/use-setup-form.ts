'use client'

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
    // The form runs in `mode: 'uncontrolled'`, so reading `form.values.title` during render would
    // not re-render on a keystroke and the character counter would sit frozen at 0/60. Subscribing
    // is the documented way to mirror one field into render state.
    const [titleValue, setTitleValue] = useState(form.getValues().title ?? '')
    form.watch('title', ({ value }) => setTitleValue(value ?? ''))

    const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    // Only the over-limit half of the title rule is live. The blank rule belongs to blur and to
    // the Continue click: running it on change would flash "Enter a study title before
    // continuing." the moment the user clears the box, which the spec forbids.
    // Mantine's clearInputErrorOnChange has already dropped any previous message by the time
    // this runs, so the <= 60 case needs no branch of its own.
    const onTitleChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const raw = event.currentTarget.value
            form.setFieldValue('title', raw)
            if (raw.length > STUDY_TITLE_MAX_CHARACTERS) {
                form.setFieldError('title', STUDY_TITLE_OVER_LIMIT_ERROR)
            }
        },
        [form],
    )

    const onTitleBlur = useCallback(() => form.validateField('title'), [form])

    // Rebuilt per click, never a static list: the programming-language field is absent until a
    // Data Partner is chosen, and a locked field renders text with nothing focusable inside it.
    // A stale id here would send focus nowhere and leave the click looking dead.
    const visibleFieldIds = useCallback(() => {
        const ids: string[] = []
        if (!isTitleLocked) ids.push(TITLE_INPUT_ID)
        if (!isOrgLocked) ids.push(ORG_SELECT_ID)
        if (!isLanguageLocked && form.getValues().orgSlug) ids.push(LANGUAGE_FIELD_ID)
        return ids
    }, [form, isTitleLocked, isOrgLocked, isLanguageLocked])

    // Flags every problem at once rather than stopping at the first: the user should see the full
    // set on one click, even though focus can only land on one of them. The errors object read
    // here is the one `validate()` returns, not `form.errors`, so the decision cannot race the
    // state update that populates it.
    const attemptContinue = useCallback(() => {
        const { hasErrors, errors } = form.validate()

        if (hasErrors) {
            focusFirstInvalid(visibleFieldIds(), (fieldId) => {
                const path = FIELD_ID_TO_FORM_PATH[fieldId as keyof typeof FIELD_ID_TO_FORM_PATH]
                return !!errors[path]
            })
            return
        }

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
