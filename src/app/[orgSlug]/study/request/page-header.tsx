'use client'

import { FC } from 'react'
import { Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'

interface ProposalHeaderProps {
    orgSlug: string
    title: string
}

export const ProposalHeader: FC<ProposalHeaderProps> = ({ orgSlug, title }) => {
    return (
        <>
            <ResearcherBreadcrumbs crumbs={{ orgSlug, current: title }} />
            <Title order={1}>{title}</Title>
        </>
    )
}

interface StudyRequestPageHeaderProps {
    orgSlug: string
}

export const StudyRequestPageHeader: FC<StudyRequestPageHeaderProps> = ({ orgSlug }) => {
    return (
        <OpenStaxFeatureFlag
            defaultContent={<ProposalHeader orgSlug={orgSlug} title="Propose a study" />}
            optInContent={<ProposalHeader orgSlug={orgSlug} title="Request data use" />}
        />
    )
}
