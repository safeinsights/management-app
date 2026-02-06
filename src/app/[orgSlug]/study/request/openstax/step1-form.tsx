'use client'

import { StudyOrgSelector } from '@/components/study/study-org-selector'
import { ProgrammingLanguageSection } from '@/components/study/programming-language-section'
import { Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { FC } from 'react'
import { StudyProposalFormValues } from '../step1-schema'

type Step1FormProps = {
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
}

export const Step1Form: FC<Step1FormProps> = ({ studyProposalForm }) => {
    return (
        <Stack gap="xxl">
            <StudyOrgSelector form={studyProposalForm} />
            <ProgrammingLanguageSection form={studyProposalForm} />
        </Stack>
    )
}
