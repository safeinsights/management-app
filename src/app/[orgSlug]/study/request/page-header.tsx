'use client'

import { FC } from 'react'
import { Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'

interface ProposalHeaderProps {
    orgSlug: string
    title: string
    studyId?: string
    studyTitle?: string
}

export const ProposalHeader: FC<ProposalHeaderProps> = ({ orgSlug, title, studyId, studyTitle }) => {
    return (
        <>
            <ResearcherBreadcrumbs crumbs={{ orgSlug, studyId, studyTitle, current: title }} />
            <Title order={1}>{title}</Title>
        </>
    )
}

interface StudyRequestPageHeaderProps {
    orgSlug: string
    studyId?: string
    studyTitle?: string
}

export const StudyRequestPageHeader: FC<StudyRequestPageHeaderProps> = ({ orgSlug, studyId, studyTitle }) => {
    return <ProposalHeader orgSlug={orgSlug} title="Request data use" studyId={studyId} studyTitle={studyTitle} />
}
