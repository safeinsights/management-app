'use client'

import React, { useEffect, useState } from 'react'
import { useQuery } from '@/common'
import { ErrorAlert, InputError } from '@/components/errors'
import { widgetBlurHandler } from '@/components/form-field'
import { RequiredIndicator } from '@/components/required-indicator'
import { getLanguagesForOrgAction } from '@/server/actions/org.actions'
import { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/form-schemas'
import { Divider, Grid, Group, Paper, Radio, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { Language } from '@/database/types'

type Props = { form: UseFormReturnType<StudyProposalFormValues> }

export const ProgrammingLanguageSection: React.FC<Props> = ({ form }) => {
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
        if (isSingleLanguage) {
            form.setFieldValue('language', data.languages[0].value)
        }
    }, [selectedOrgSlug, form, isSingleLanguage, data?.languages])

    let body: React.ReactNode = null

    if (!selectedOrgSlug) {
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
                <Text id="programming-language-helper">{helperText}</Text>

                <Grid align="flex-start">
                    <Grid.Col span={12}>
                        {/* Radio.Group's blur is a bubbled focusout, so tabbing between the radios
                            would validate a still-empty group. widgetBlurHandler waits for focus to
                            leave the group entirely (OTTER-647). */}
                        {/* Radio.Group puts role="radiogroup" on an inner element that takes its
                            name from `labelProps.id` and its description from Mantine's own
                            `description` / `error` props. Hand-passed aria-* attributes land on
                            the outer wrapper, which has no role, so they were reaching nothing.
                            `inputWrapperOrder` keeps Mantine from rendering a second copy of the
                            helper text and message that this component already renders below. */}
                        <Radio.Group
                            id="programming-language"
                            labelProps={{ id: 'programming-language-title' }}
                            description={helperText}
                            descriptionProps={{ id: 'programming-language-helper' }}
                            error={form.errors.language}
                            inputWrapperOrder={['input']}
                            value={form.values.language ?? (isSingleLanguage ? languages[0].value : '')}
                            onChange={(value) => form.setFieldValue('language', value as Language)}
                            onBlur={widgetBlurHandler(() => form.validateField('language'))}
                        >
                            <Group gap="xl">
                                {languages.map((opt) => (
                                    <Radio key={opt.value} value={opt.value} label={opt.label} />
                                ))}
                            </Group>
                        </Radio.Group>
                        {form.errors.language && (
                            <span id="programming-language-error">
                                <InputError error={form.errors.language} />
                            </span>
                        )}
                    </Grid.Col>
                </Grid>
            </>
        )
    }

    return (
        <Paper p="xxl">
            <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                STEP 1B
            </Text>
            <Title fz={20} id="programming-language-title" order={4} c="charcoal.9">
                Programming language
                <RequiredIndicator fz={20} fw={700} />
            </Title>
            <Divider my="md" />
            <Stack gap="lg">{body}</Stack>
        </Paper>
    )
}
