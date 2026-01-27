'use client'

import { StudyOrgSelector } from '@/components/study/study-org-selector'
import { ProgrammingLanguageSection } from '@/components/study/programming-language-section'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { EditableText } from '@/components/editable-text'
import { FormFieldLabel } from '@/components/form-field-label'
import { Paper } from '@mantine/core'
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
        <>
            <StudyOrgSelector form={studyProposalForm} />
            <RequestStudyDetails studyProposalForm={studyProposalForm} existingFiles={existingFiles} />
            <ProgrammingLanguageSection form={studyProposalForm} />
        </>
    )
}

const EditableStudyProposalForm: FC<StudyProposalFormProps> = ({ studyProposalForm }) => {
    return (
        <>
            <StudyOrgSelector form={studyProposalForm} />
            <Paper p="xl">
                <FormFieldLabel label="Study Description" inputId="description" />
                <EditableText
                    id="description"
                    placeholder="Enter study description..."
                    {...studyProposalForm.getInputProps('description')}
                />
            </Paper>
            <ProgrammingLanguageSection form={studyProposalForm} />
        </>
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
