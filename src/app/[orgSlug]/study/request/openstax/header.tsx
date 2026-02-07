'use client'

import { FC } from 'react'
import { Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'

interface OpenStaxProposalHeaderProps {
    orgSlug: string
}

export const OpenStaxProposalHeader: FC<OpenStaxProposalHeaderProps> = ({ orgSlug }) => {
    return (
        <>
            <ResearcherBreadcrumbs crumbs={{ orgSlug, current: 'Request data use' }} />
            <Title order={1}>Request data use</Title>
        </>
    )
}
