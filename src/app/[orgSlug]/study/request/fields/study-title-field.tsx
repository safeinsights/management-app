'use client'

import { FC, type ChangeEvent } from 'react'
import { TextInput } from '@mantine/core'
import { CharacterCounter } from '@/components/character-counter'
import { FormField, nativeFieldProps } from '@/components/form-field'
import { ReadOnlyField } from '@/components/read-only-field'
import { STUDY_TITLE_MAX_CHARACTERS } from '../form-schemas'
import { TITLE_INPUT_ID } from './field-ids'

const LABEL = 'Study title'
const DESCRIPTION = 'Give your study a short, clear title to identify it on SafeInsights.'

interface StudyTitleFieldProps {
    value: string
    error: string | undefined
    onChange: (event: ChangeEvent<HTMLInputElement>) => void
    onBlur: () => void
    /** True once the proposal has been submitted: the title is then permanently read-only. */
    isLocked: boolean
}

export const StudyTitleField: FC<StudyTitleFieldProps> = ({ value, error, onChange, onBlur, isLocked }) => {
    if (isLocked) return <ReadOnlyField label={LABEL} value={value} />

    return (
        <FormField
            inputId={TITLE_INPUT_ID}
            label={LABEL}
            required
            description={DESCRIPTION}
            error={error}
            // The character-limit message appears while the user is still typing, before any blur
            // or click moves focus, so this is the one field whose error has to announce itself.
            errorLive
            footer={<CharacterCounter count={value.length} maxCharacters={STUDY_TITLE_MAX_CHARACTERS} />}
        >
            <TextInput
                id={TITLE_INPUT_ID}
                maw={620}
                placeholder="Ex. Impact of highlighting on student learning outcomes."
                // Deliberately no maxLength: the spec requires typing past the cap to stay
                // possible, with the error shown, rather than the input silently swallowing keys.
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                {...nativeFieldProps(error, { required: true, description: DESCRIPTION })}
            />
        </FormField>
    )
}
