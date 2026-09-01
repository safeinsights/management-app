'use client'

import React, { useEffect, useState } from 'react'
import { Box, Radio, Stack, Text } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { useQuery } from '@/common'
import { ErrorAlert, InputError } from '@/components/errors'
import { useWidgetBlur } from '@/components/form-field'
import { ReadOnlyField } from '@/components/read-only-field'
import { RequiredIndicator } from '@/components/required-indicator'
import { getLanguagesForOrgAction } from '@/server/actions/org.actions'
import { Language } from '@/database/types'
import { StudyProposalFormValues } from '../form-schemas'
import { LANGUAGE_FIELD_ID } from './field-ids'

const LABEL = 'Programming language'
const GROUP_ID = 'programming-language'
const TITLE_ID = 'programming-language-title'
const HELPER_ID = 'programming-language-helper'
const ERROR_ID = 'programming-language-error'

const ErrorLine: React.FC<{ error: React.ReactNode }> = ({ error }) => {
    if (!error) return null

    return (
        <span id={ERROR_ID}>
            <InputError error={error} />
        </span>
    )
}

interface ProgrammingLanguageFieldProps {
    form: UseFormReturnType<StudyProposalFormValues>
    // True once the draft has a persisted language: it cannot be changed after Step 1.
    isLocked: boolean
    lockedLanguageLabel?: string
}

export const ProgrammingLanguageField: React.FC<ProgrammingLanguageFieldProps> = ({
    form,
    isLocked,
    lockedLanguageLabel,
}) => {
    const [selectedOrgSlug, setSelectedOrgSlug] = useState(form.values.orgSlug)
    form.watch('orgSlug', ({ value }) => setSelectedOrgSlug(value))

    const { data, isLoading } = useQuery({
        queryKey: ['languages-for-org', selectedOrgSlug],
        queryFn: () => getLanguagesForOrgAction({ orgSlug: selectedOrgSlug }),
        // A stale session can leave orgSlug empty; without this the org lookup throws "no result"
        // and 500s the request page.
        enabled: !!selectedOrgSlug,
    })

    const orgName = data?.orgName ?? ''
    const languages = data?.languages || []
    const isSingleLanguage = data?.languages?.length === 1

    let helperText: string

    if (isSingleLanguage) {
        helperText = `At present, ${orgName} only supports ${languages[0].label}.`
    } else {
        helperText = `${orgName} will use the language you select to set up the right environment for you.`
    }

    useEffect(() => {
        // A locked field has no error slot and is skipped when focusing, so a value changed here
        // could be neither seen nor corrected (OTTER-647).
        if (isLocked || !data) return

        if (data.languages.length === 1) {
            form.setFieldValue('language', data.languages[0].value)
            return
        }

        // A language the new partner cannot run still satisfies the enum, so leaving it would let
        // validation pass on an environment that does not exist.
        const current = form.getValues().language
        if (current && !data.languages.some((option) => option.value === current)) {
            form.setFieldValue('language', null)
            form.clearFieldError('language')
        }
        // form intentionally excluded: Mantine rebuilds it every render, so listing it would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedOrgSlug, data, isLocked])

    const widgetBlur = useWidgetBlur(() => form.validateField('language'))

    const error = form.errors.language
    const describedBy = [HELPER_ID, error ? ERROR_ID : null].filter(Boolean).join(' ')

    // Radio.Group's context does not carry `error` to its children, so a boolean `error` restyles
    // the circles without a second message (OTTER-647).
    const languageRadios = languages.map((opt) => (
        <Radio
            key={opt.value}
            value={opt.value}
            label={opt.label}
            error={!!error}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
        />
    ))

    let body: React.ReactNode = null

    if (isLocked) {
        return <ReadOnlyField label={LABEL} value={lockedLanguageLabel || form.getValues().language} />
    } else if (!selectedOrgSlug) {
        return null
    } else if (isLoading) {
        body = (
            <Text id="programming-language-status" role="status" aria-live="polite">
                Loading available programming languages…
            </Text>
        )
    } else if (!data) {
        body = <ErrorAlert error="Failed to load programming languages" />
    } else if (languages.length > 0) {
        body = (
            <>
                <Text id={HELPER_ID} size="xs" c="dimmed">
                    {helperText}
                </Text>

                {/* Blur is a bubbled focusout, so tabbing between radios would validate a
                    still-empty group; useWidgetBlur waits for the user to leave (OTTER-647). */}
                {/* Radio.Group puts role="radiogroup" on an inner element named by
                    `labelProps.id`; hand-passed aria-* lands on the roleless outer wrapper. */}
                <Radio.Group
                    id={GROUP_ID}
                    labelProps={{ id: TITLE_ID }}
                    description={helperText}
                    descriptionProps={{ id: HELPER_ID }}
                    error={error}
                    inputWrapperOrder={['input']}
                    value={form.values.language ?? (isSingleLanguage ? languages[0].value : '')}
                    onChange={(value) => form.setFieldValue('language', value as Language)}
                    {...widgetBlur}
                >
                    {/* Stacked, not a row: the multi-language design lists the options vertically. */}
                    <Stack gap="xs">{languageRadios}</Stack>
                </Radio.Group>
                <ErrorLine error={error} />
            </>
        )
    }

    return (
        // A wrapper rather than the group's own id: Mantine consumes that id internally and
        // never renders it, so getElementById would find nothing.
        <Box id={LANGUAGE_FIELD_ID}>
            <Text id={TITLE_ID} fw={600} fz="sm" c="charcoal.9">
                {LABEL}
                <RequiredIndicator />
            </Text>
            <Stack gap="xs" mt={4}>
                {body}
            </Stack>
        </Box>
    )
}
