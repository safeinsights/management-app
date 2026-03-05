'use client'

import { FC } from 'react'
import { Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'

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
    return <ProposalHeader orgSlug={orgSlug} title="Request data use" />
}
