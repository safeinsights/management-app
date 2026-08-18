'use client'

import React, { useEffect, useState } from 'react'
import { Box, Group, Radio, Stack, Text } from '@mantine/core'
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
    /** True once the draft has a persisted language: it cannot be changed after Step 1. */
    isLocked: boolean
    /** Display label of the locked language, e.g. "Python" rather than the stored `PYTHON`. */
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
        // A stale session can leave orgSlug empty (new org missing from the
        // user's JWT). Without this guard the query fires with '' and the org
        // lookup throws "no result", 500-ing the whole request page.
        enabled: !!selectedOrgSlug,
    })

    const orgName = data?.orgName ?? ''
    const languages = data?.languages || []
    const isSingleLanguage = data?.languages?.length === 1

    let helperText: string

    if (isSingleLanguage) {
        helperText = `At the present ${orgName} only supports ${languages[0].label}. Code files submitted in other languages will not be able to run.`
    } else {
        helperText = `Indicate the programming language that you will use in your data analysis. ${orgName} will use this to set up the right environment for you.`
    }

    useEffect(() => {
        if (!data) return

        if (data.languages.length === 1) {
            form.setFieldValue('language', data.languages[0].value)
            return
        }

        // A language the newly chosen partner cannot run must not survive the switch: it still
        // satisfies the enum, so validation would pass on an environment that does not exist.
        // The error is cleared with it, because the user has not failed anything yet.
        const current = form.getValues().language
        if (current && !data.languages.some((option) => option.value === current)) {
            form.setFieldValue('language', null)
            form.clearFieldError('language')
        }
    }, [selectedOrgSlug, form, data])

    const widgetBlur = useWidgetBlur(() => form.validateField('language'))

    const error = form.errors.language
    const describedBy = [HELPER_ID, error ? ERROR_ID : null].filter(Boolean).join(' ')

    // Radio.Group's context carries value/onChange/size/name/disabled to its children but not
    // `error`, so the circles stay grey while the group's message turns red. A boolean `error`
    // applies Mantine's error styling without adding a second message (OTTER-647).
    //
    // `aria-invalid` sits on the inputs rather than on the role="radiogroup" element, which
    // Mantine renders itself and passes nothing through to, so the inputs are the only reachable
    // target for it.
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
                <Text id={HELPER_ID}>{helperText}</Text>

                {/* Radio.Group's blur is a bubbled focusout, so tabbing between the radios
                    would validate a still-empty group. useWidgetBlur waits for the user to
                    leave the group entirely (OTTER-647). */}
                {/* Radio.Group puts role="radiogroup" on an inner element that takes its
                    name from `labelProps.id` and its description from Mantine's own
                    `description` / `error` props. Hand-passed aria-* attributes land on
                    the outer wrapper, which has no role, so they were reaching nothing.
                    `inputWrapperOrder` keeps Mantine from rendering a second copy of the
                    helper text and message that this component already renders below. */}
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
                    <Group gap="xl">{languageRadios}</Group>
                </Radio.Group>
                <ErrorLine error={error} />
            </>
        )
    }

    return (
        // The focus target for a failed Continue click. It is a wrapper rather than the group's
        // own id because Mantine consumes that id internally and never renders it, so
        // getElementById would find nothing and the jump would silently do nothing.
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
