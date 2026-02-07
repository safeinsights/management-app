'use client'

import { FC } from 'react'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { LegacyProposalHeader } from './legacy/header'
import { OpenStaxProposalHeader } from './openstax/header'

interface StudyRequestPageHeaderProps {
    orgSlug: string
}

export const StudyRequestPageHeader: FC<StudyRequestPageHeaderProps> = ({ orgSlug }) => {
    return (
        <OpenStaxFeatureFlag
            defaultContent={<LegacyProposalHeader orgSlug={orgSlug} />}
            optInContent={<OpenStaxProposalHeader orgSlug={orgSlug} />}
        />
    )
}
