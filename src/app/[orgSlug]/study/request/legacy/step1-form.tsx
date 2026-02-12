'use client'

import { StudyOrgSelector } from '@/components/study/study-org-selector'
import { ProgrammingLanguageSection } from '@/components/study/programming-language-section'
import { Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { FC } from 'react'
import { StudyProposalFormValues } from '../form-schemas'
import { RequestStudyDetails } from '../study-details'
import type { ExistingFilePaths } from '../study-details'

type Step1FormProps = {
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
    existingFiles?: ExistingFilePaths
}

export const Step1Form: FC<Step1FormProps> = ({ studyProposalForm, existingFiles }) => {
    return (
        <Stack gap="xxl">
            <StudyOrgSelector form={studyProposalForm} />
            <RequestStudyDetails studyProposalForm={studyProposalForm} existingFiles={existingFiles} />
            <ProgrammingLanguageSection form={studyProposalForm} />
        </Stack>
    )
}
