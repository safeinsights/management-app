'use client'

import React, { useEffect, useMemo } from 'react'
import { useQuery } from '@/common'
import { InputError } from '@/components/errors'
import { listAllOrgsAction } from '@/server/actions/org.actions'
import { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/study-proposal-form-schema'
import { Divider, Grid, Paper, Radio, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'

type Props = {
    form: UseFormReturnType<StudyProposalFormValues>
}

export const ProgrammingLanguageSection: React.FC<Props> = ({ form }) => {
    const selectedOrgSlug = form.values.orgSlug

    const { data: orgs, isLoading: isLoadingOrgs } = useQuery({
        queryKey: ['all-orgs'],
        queryFn: () => listAllOrgsAction(),
    })

    // Consolidate org-related derived state into a single useMemo
    const { orgName, hasNoBaseImages, isSingleLanguage, options } = useMemo(() => {
        const org = orgs?.find((o) => o.slug === selectedOrgSlug)
        const langs = org?.supportedLanguages ?? []
        const noBaseImages = !selectedOrgSlug || langs.length === 0

        return {
            orgName: org?.name || (selectedOrgSlug ? 'this data organization' : ''),
            hasNoBaseImages: noBaseImages,
            isSingleLanguage: langs.length === 1,
            options: noBaseImages ? (['R', 'PYTHON'] as const) : langs,
        }
    }, [orgs, selectedOrgSlug])

    useEffect(() => {
        // Reset language whenever org changes
        form.setFieldValue('language', null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedOrgSlug])

    useEffect(() => {
        // Auto-select language in the single-language case
        if (isSingleLanguage && !form.values.language && options.length === 1) {
            form.setFieldValue('language', options[0])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSingleLanguage, options])

    if (!selectedOrgSlug) {
        return (
            <Paper p="xl" mt="xxl">
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    Step 3 of 4
                </Text>
                <Title order={4}>Programming language</Title>
                <Divider my="md" />
                <Text>Select a data organization above to see which programming languages are available.</Text>
            </Paper>
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

            <Stack gap="lg">
                {isLoadingOrgs && (
                    <Text id="programming-language-status" role="status" aria-live="polite">
                        Loading available programming languages…
                    </Text>
                )}

                {!isLoadingOrgs && (
                    <>
                        {hasNoBaseImages && (
                            <Text id="programming-language-helper">
                                No base images are currently configured for {orgName || 'this data organization'}. You
                                can still select the language you intend to use; an administrator will need to configure
                                a matching base image before your code can run.
                            </Text>
                        )}

                        {!hasNoBaseImages && isSingleLanguage && (
                            <Text id="programming-language-helper">
                                At the present {orgName} only supports {options[0] === 'R' ? 'R' : 'Python'}. Code files
                                submitted in other languages will not be able to run.
                            </Text>
                        )}

                        {!hasNoBaseImages && !isSingleLanguage && (
                            <Text id="programming-language-helper">
                                Indicate the programming language that you will use in your data analysis. {orgName}{' '}
                                will use this to setup the right environment for you.
                            </Text>
                        )}
                    </>
                )}

                <Grid align="flex-start">
                    <Grid.Col span={12}>
                        <Radio.Group
                            id="programming-language"
                            aria-labelledby="programming-language-title"
                            aria-describedby="programming-language-helper programming-language-status"
                            value={form.values.language ?? ''}
                            onChange={(value) => form.setFieldValue('language', value as 'R' | 'PYTHON')}
                        >
                            <Stack gap="xs">
                                {options.map((lang) => (
                                    <Radio key={lang} value={lang} label={lang === 'R' ? 'R' : 'Python'} />
                                ))}
                            </Stack>
                        </Radio.Group>
                        {form.errors.language && <InputError error={form.errors.language} />}
                    </Grid.Col>
                </Grid>
            </Stack>
        </Paper>
    )
}
