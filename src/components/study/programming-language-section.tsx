'use client'

import React, { useEffect } from 'react'
import { useQuery } from '@/common'
import { useSession } from '@/hooks/session'
import { InputError } from '@/components/errors'
import { getOrgsWithLanguagesAction } from '@/server/actions/org.actions'
import { StudyProposalFormValues } from '@/app/[orgSlug]/study/request/study-proposal-form-schema'
import { Divider, Grid, Paper, Radio, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { getOrgBySlug, isOrgAdmin, OrgWithLanguages } from '@/lib/types'

type Props = {
    form: UseFormReturnType<StudyProposalFormValues>
}

export type ProgrammingLanguageUiState = {
    orgName: string
    isSingleLanguage: boolean
    options: ReadonlyArray<'R' | 'PYTHON'>
}

export const deriveProgrammingLanguageUiState = ({
    org,
    isAdmin,
}: {
    org: OrgWithLanguages | null
    isAdmin: boolean
}): ProgrammingLanguageUiState => {
    if (!org) {
        return {
            orgName: '',
            isSingleLanguage: false,
            options: [],
        }
    }

    if (isAdmin) {
        // Admin reviewers can always see both R and Python. We deliberately do not auto-select
        // a language for admins; they must choose explicitly.
        return {
            orgName: org.name,
            isSingleLanguage: false,
            options: ['R', 'PYTHON'],
        }
    }

    const supported = org.supportedLanguages as ReadonlyArray<'R' | 'PYTHON'>
    const isSingleLanguage = supported.length === 1

    return {
        orgName: org.name,
        isSingleLanguage,
        options: supported,
    }
}

export const ProgrammingLanguageSection: React.FC<Props> = ({ form }) => {
    const selectedOrgSlug = form.values.orgSlug

    const { session } = useSession()
    const currentOrg = session && selectedOrgSlug ? getOrgBySlug(session, selectedOrgSlug) : null
    const isAdmin = currentOrg ? isOrgAdmin(currentOrg) : false

    const { data: orgs, isLoading: isLoadingOrgs } = useQuery<OrgWithLanguages[]>({
        queryKey: ['orgs-with-languages'],
        queryFn: () => getOrgsWithLanguagesAction(),
    })

    const selectedOrg =
        orgs && selectedOrgSlug ? orgs.find((o) => o.slug === selectedOrgSlug) ?? null : null

    const { orgName, isSingleLanguage, options } = deriveProgrammingLanguageUiState({
        org: selectedOrg,
        isAdmin,
    })

    useEffect(() => {
        // Reset language whenever org changes
        form.setFieldValue('language', null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedOrgSlug])

    useEffect(() => {
        // Auto-select language in the single-language case for non-admin users
        if (isSingleLanguage && !form.values.language && options.length === 1) {
            form.setFieldValue('language', options[0])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSingleLanguage, options])

    const shouldShowContent = !!selectedOrgSlug

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
                {shouldShowContent && isLoadingOrgs && (
                    <Text id="programming-language-status" role="status" aria-live="polite">
                        Loading available programming languages…
                    </Text>
                )}

                {shouldShowContent && !isLoadingOrgs && options.length > 0 && (
                    <>
                        {isSingleLanguage ? (
                            <Text id="programming-language-helper">
                                At the present {orgName} only supports {options[0] === 'R' ? 'R' : 'Python'}. Code
                                files submitted in other languages will not be able to run.
                            </Text>
                        ) : (
                            <Text id="programming-language-helper">
                                Indicate the programming language that you will use in your data analysis. {orgName} will
                                use this to setup the right environment for you.
                            </Text>
                        )}
                    </>
                )}

                {shouldShowContent && options.length > 0 && (
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
                )}
            </Stack>
        </Paper>
    )
}