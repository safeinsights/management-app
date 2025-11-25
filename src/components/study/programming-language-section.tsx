'use client'

import React, { useEffect, useMemo } from 'react'
import { useQuery } from '@/common'
import { InputError } from '@/components/errors'
import { fetchOrgBaseImagesAction } from '@/app/[orgSlug]/admin/settings/base-images.actions'
import { listAllOrgsAction } from '@/server/actions/org.actions'
import { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/study-proposal-form-schema'
import { Divider, Grid, Paper, Radio, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'

type Props = {
    form: UseFormReturnType<StudyProposalFormValues>
}

export const ProgrammingLanguageSection: React.FC<Props> = ({ form }) => {
    const selectedOrgSlug = form.values.orgSlug

    const { data: orgs } = useQuery({
        queryKey: ['all-orgs'],
        queryFn: () => listAllOrgsAction(),
    })

    const selectedOrg = useMemo(() => orgs?.find((org) => org.slug === selectedOrgSlug), [orgs, selectedOrgSlug])

    const orgName = selectedOrg?.name || (selectedOrgSlug ? 'this data organization' : '')

    const {
        data: baseImages,
        isLoading: isLoadingBaseImages,
        isError: isBaseImagesError,
    } = useQuery({
        queryKey: ['orgBaseImages', selectedOrgSlug],
        queryFn: () =>
            fetchOrgBaseImagesAction({
                orgSlug: selectedOrgSlug!,
            }),
        enabled: !!selectedOrgSlug,
    })

    const { hasNoBaseImages, supportedLanguages, isSingleLanguage } = useMemo(() => {
        if (!selectedOrgSlug || !baseImages || baseImages.length === 0) {
            return {
                hasNoBaseImages: true,
                supportedLanguages: [] as Array<'R' | 'PYTHON'>,
                isSingleLanguage: false,
            }
        }

        const nonTesting = baseImages.filter((img) => !img.isTesting)
        if (nonTesting.length === 0) {
            return {
                hasNoBaseImages: true,
                supportedLanguages: [] as Array<'R' | 'PYTHON'>,
                isSingleLanguage: false,
            }
        }

        const langs = Array.from(new Set(nonTesting.map((img) => img.language as 'R' | 'PYTHON')))

        return {
            hasNoBaseImages: false,
            supportedLanguages: langs,
            isSingleLanguage: langs.length === 1,
        }
    }, [baseImages, selectedOrgSlug])

    const options: Array<'R' | 'PYTHON'> = useMemo(
        () =>
            hasNoBaseImages || supportedLanguages.length === 0
                ? (['R', 'PYTHON'] as Array<'R' | 'PYTHON'>)
                : supportedLanguages,
        [hasNoBaseImages, supportedLanguages],
    )

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
                {isLoadingBaseImages && <Text>Loading available programming languages…</Text>}

                {isBaseImagesError && (
                    <Text c="red">
                        We were unable to determine which programming languages are supported for this data
                        organization. You can still select a language below.
                    </Text>
                )}

                {!isLoadingBaseImages && !isBaseImagesError && (
                    <>
                        {hasNoBaseImages && (
                            <Text>
                                No base images are currently configured for {orgName || 'this data organization'}. You
                                can still select the language you intend to use; an administrator will need to configure
                                a matching base image before your code can run.
                            </Text>
                        )}

                        {!hasNoBaseImages && isSingleLanguage && options.length === 1 && (
                            <Text>
                                At the present {orgName} only supports {options[0] === 'R' ? 'R' : 'Python'}. Code files
                                submitted in other languages will not be able to run.
                            </Text>
                        )}

                        {!hasNoBaseImages && !isSingleLanguage && (
                            <Text>
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
