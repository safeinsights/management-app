'use client'

import React, { useEffect, useRef, useState } from 'react'
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
    const [selectedOrgSlug, setSelectedOrgSlug] = useState(form.getValues().orgSlug)
    form.watch('orgSlug', ({ value }) => setSelectedOrgSlug(value))

    // Mirrored rather than read off `form.values`, which Mantine documents as always stale in
    // uncontrolled mode. setFieldValue schedules no render of its own, so without this a reset
    // would leave a dot on a radio the form no longer holds.
    const [selectedLanguage, setSelectedLanguage] = useState(form.getValues().language)
    form.watch('language', ({ value }) => setSelectedLanguage(value))

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

    // The sole option of a single-language partner is checked from the first paint; the effect that
    // writes it to the form only runs after it.
    const checkedLanguage = selectedLanguage ?? (isSingleLanguage ? languages[0].value : '')

    let helperText: string

    if (isSingleLanguage) {
        helperText = `At present, ${orgName} only supports ${languages[0].label}.`
    } else {
        helperText = `${orgName} will use the language you select to set up the right environment for you.`
    }

    // Which partner the defaults below were applied for: a background refetch hands back a fresh
    // `data` every time, and re-applying then would wipe a choice just made. Seeded from a language
    // the form already holds, so a remount (Step 2 and back) is not read as a change of partner.
    const initialValues = form.getValues()
    const appliedOrgSlug = useRef<string | null>(initialValues.language ? initialValues.orgSlug : null)

    useEffect(() => {
        // A locked field has no error slot and is skipped when focusing, so a value changed here
        // could be neither seen nor corrected (OTTER-647).
        if (isLocked || !data) return

        const current = form.getValues().language
        const isNewPartner = appliedOrgSlug.current !== selectedOrgSlug
        // A language the partner cannot run still satisfies the enum, so leaving it would let
        // validation pass on an environment that does not exist. Re-checked on every refetch, since
        // a partner can lose a language while it is selected.
        const isUnsupported = !!current && !data.languages.some((option) => option.value === current)
        if (!isNewPartner && !isUnsupported) return

        appliedOrgSlug.current = selectedOrgSlug

        // A new partner starts the choice over: the design's default for a multi-language partner
        // is nothing selected, and a language carried across is not one chosen for this partner.
        const onlyOption = data.languages.length === 1 ? data.languages[0].value : null
        form.setFieldValue('language', onlyOption)
        // `language` is in validateInputOnChange, so the line above queues a required-error for the
        // null case, on a field nobody has failed yet. clearFieldError cannot undo it: it bails
        // while that error is still unflushed, so the removal has to queue behind it instead.
        form.setErrors((current) => {
            const next = { ...current }
            delete next.language
            return next
        })
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
                    value={checkedLanguage}
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
