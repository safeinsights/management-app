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
            <ResearcherBreadcrumbs crumbs={{ orgSlug, current: 'Request data use' }} />
            <Title order={1}>Request data use</Title>
        </>
    )
}
