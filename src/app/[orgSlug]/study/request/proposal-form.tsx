'use client'

import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { UseFormReturnType } from '@mantine/form'
import { FC } from 'react'
import { StudyProposalFormValues } from './form-schemas'
import type { ExistingFilePaths } from './study-details'
import { Step1Form as LegacyStep1Form } from './legacy/step1-form'
import { Step1Form as OpenStaxStep1Form } from './openstax/step1-form'

type StudyProposalFormProps = {
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
    existingFiles?: ExistingFilePaths
}

export const StudyProposalForm: FC<StudyProposalFormProps> = (props) => {
    return (
        <OpenStaxFeatureFlag
            defaultContent={<LegacyStep1Form {...props} />}
            optInContent={<OpenStaxStep1Form {...props} />}
        />
    )
}
