'use client'

import React, { useEffect } from 'react'
import { useQuery } from '@/common'
import { ErrorAlert, InputError } from '@/components/errors'
import { getLanguagesForOrgAction } from '@/server/actions/org.actions'
import { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/study-proposal-form-schema'
import { Divider, Grid, Group, Paper, Radio, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { Language } from '@/database/types'

type Props = { form: UseFormReturnType<StudyProposalFormValues> }

export const ProgrammingLanguageSection: React.FC<Props> = ({ form }) => {
    const selectedOrgSlug = form.values.orgSlug

    const { data, isLoading } = useQuery({
        queryKey: ['languages-for-org', selectedOrgSlug],
        queryFn: () => getLanguagesForOrgAction({ orgSlug: selectedOrgSlug }),
    })

    const orgName = data?.orgName ?? ''
    const languages = data?.languages || []
    const isSingleLanguage = data?.languages?.length === 1

    let helperText: string

    if (isSingleLanguage) {
        helperText = `At the present ${orgName} only supports ${languages[0].label}. Code files submitted in other languages will not be able to run.`
    } else {
        helperText = `Indicate the programming language that you will use in your data analysis. ${orgName} will use this to setup the right environment for you.`
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
                        <Radio.Group
                            id="programming-language"
                            aria-labelledby="programming-language-title"
                            aria-describedby="programming-language-helper programming-language-status"
                            value={form.values.language ?? (isSingleLanguage ? languages[0].value : '')}
                            onChange={(value) => form.setFieldValue('language', value as Language)}
                        >
                            <Group gap="xl">
                                {languages.map((opt) => (
                                    <Radio key={opt.value} {...opt} />
                                ))}
                            </Group>
                        </Radio.Group>
                        {form.errors.language && <InputError error={form.errors.language} />}
                    </Grid.Col>
                </Grid>
            </>
        )
    }

    return (
        <Paper p="xl" mt="xxl">
            <Text fz="sm" fw={700} c="gray.6" pb="sm">
                Step 3 of 4
            </Text>
            <Title id="programming-language-title" order={4}>
                Programming language
            </Title>
            <Divider my="md" />
            <Stack gap="lg">{body}</Stack>
        </Paper>
    )
}
