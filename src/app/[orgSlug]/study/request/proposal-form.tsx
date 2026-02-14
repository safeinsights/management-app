'use client'

import { FC } from 'react'
import { Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { StudyOrgSelector } from '@/components/study/study-org-selector'
import { ProgrammingLanguageSection } from '@/components/study/programming-language-section'
import { StudyProposalFormValues } from './form-schemas'
import { RequestStudyDetails, type ExistingFilePaths } from './study-details'

type StudyProposalFormProps = {
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
    studyDetails?: { existingFiles?: ExistingFilePaths }
}

export const StudyProposalForm: FC<StudyProposalFormProps> = ({ studyProposalForm, studyDetails }) => {
    return (
        <Stack gap="xxl">
            <StudyOrgSelector form={studyProposalForm} />
            {studyDetails && (
                <RequestStudyDetails studyProposalForm={studyProposalForm} existingFiles={studyDetails.existingFiles} />
            )}
            <ProgrammingLanguageSection form={studyProposalForm} />
        </Stack>
    )
}
