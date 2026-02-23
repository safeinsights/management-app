'use client'

import { FC } from 'react'
import { Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { useOpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { StudyOrgSelector } from '@/components/study/study-org-selector'
import { ProgrammingLanguageSection } from '@/components/study/programming-language-section'
import { StudyProposalFormValues } from './form-schemas'
import { RequestStudyDetails, type ExistingFilePaths } from './study-details'

type StudyProposalFormProps = {
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
    existingFiles?: ExistingFilePaths
}

export const StudyProposalForm: FC<StudyProposalFormProps> = ({ studyProposalForm, existingFiles }) => {
    const isOpenStaxFlow = useOpenStaxFeatureFlag()

    return (
        <Stack gap="xxl">
            <StudyOrgSelector form={studyProposalForm} />
            {!isOpenStaxFlow && (
                <RequestStudyDetails studyProposalForm={studyProposalForm} existingFiles={existingFiles} />
            )}
            <ProgrammingLanguageSection form={studyProposalForm} />
        </Stack>
    )
}
