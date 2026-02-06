'use client'

import { FC } from 'react'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { Step1Footer as LegacyStep1Footer } from './legacy/step1-footer'
import { Step1Footer as OpenStaxStep1Footer } from './openstax/step1-footer'

interface ProposalFooterActionsProps {
    isDirty: boolean
    isSaving: boolean
    isFormValid: boolean
    isStep1Valid: boolean
    onSave: (proceed: boolean) => void
    onCancel: () => void
}

export const ProposalFooterActions: FC<ProposalFooterActionsProps> = (props) => {
    return (
        <OpenStaxFeatureFlag
            defaultContent={<LegacyStep1Footer {...props} />}
            optInContent={<OpenStaxStep1Footer {...props} />}
        />
    )
}
