'use client'

import { StudyOrgSelector } from '@/components/study/study-org-selector'
import { ProgrammingLanguageSection } from '@/components/study/programming-language-section'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { FC } from 'react'
import { StudyProposalFormValues } from './step1-schema'
import { RequestStudyDetails } from './study-details'
import type { ExistingFilePaths } from './study-details'

type StudyProposalFormProps = {
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
    existingFiles?: ExistingFilePaths
}

const LegacyStudyProposalForm: FC<StudyProposalFormProps> = ({ studyProposalForm, existingFiles }) => {
    return (
        <Stack gap="xxl">
            <StudyOrgSelector form={studyProposalForm} />
            <RequestStudyDetails studyProposalForm={studyProposalForm} existingFiles={existingFiles} />
            <ProgrammingLanguageSection form={studyProposalForm} />
        </Stack>
    )
}

const EditableStudyProposalForm: FC<StudyProposalFormProps> = ({ studyProposalForm }) => {
    return (
        <Stack gap="xxl">
            <StudyOrgSelector form={studyProposalForm} />
            <ProgrammingLanguageSection form={studyProposalForm} />
        </Stack>
    )
}

export const StudyProposalForm: FC<StudyProposalFormProps> = (props) => {
    return (
        <OpenStaxFeatureFlag
            defaultContent={<LegacyStudyProposalForm {...props} />}
            optInContent={<EditableStudyProposalForm {...props} />}
        />
    )
}
