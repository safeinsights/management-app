'use client'

import { FC } from 'react'
import { Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { StudyOrgSelector } from '@/components/study/study-org-selector'
import { ProgrammingLanguageSection } from '@/components/study/programming-language-section'
import { StudyProposalFormValues } from './form-schemas'

type StudyProposalFormProps = {
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
}

export const StudyProposalForm: FC<StudyProposalFormProps> = ({ studyProposalForm }) => {
    return (
        <Stack gap="xxl">
            <StudyOrgSelector form={studyProposalForm} />
            <ProgrammingLanguageSection form={studyProposalForm} />
        </Stack>
    )
}
