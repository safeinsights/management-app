'use client'

import { FC } from 'react'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { Step1Header as LegacyStep1Header } from './legacy/step1-header'
import { Step1Header as OpenStaxStep1Header } from './openstax/step1-header'

interface StudyRequestPageHeaderProps {
    orgSlug: string
}

export const StudyRequestPageHeader: FC<StudyRequestPageHeaderProps> = ({ orgSlug }) => {
    return (
        <OpenStaxFeatureFlag
            defaultContent={<LegacyStep1Header orgSlug={orgSlug} />}
            optInContent={<OpenStaxStep1Header orgSlug={orgSlug} />}
        />
    )
}
