'use client'

import { FC } from 'react'
import { Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'

interface LegacyProposalHeaderProps {
    orgSlug: string
}

export const LegacyProposalHeader: FC<LegacyProposalHeaderProps> = ({ orgSlug }) => {
    return (
        <>
            <ResearcherBreadcrumbs crumbs={{ orgSlug, current: 'Propose a study' }} />
            <Title order={1}>Propose a study</Title>
        </>
    )
}
