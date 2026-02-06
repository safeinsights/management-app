'use client'

import { FC } from 'react'
import { Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'

interface Step1HeaderProps {
    orgSlug: string
}

export const Step1Header: FC<Step1HeaderProps> = ({ orgSlug }) => {
    return (
        <>
            <ResearcherBreadcrumbs crumbs={{ orgSlug, current: 'Propose a study' }} />
            <Title order={1}>Propose a study</Title>
        </>
    )
}
