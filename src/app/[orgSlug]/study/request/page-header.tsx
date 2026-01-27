'use client'

import { FC } from 'react'
import { Title } from '@mantine/core'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { OpenStaxFeatureFlag } from '@/components/openstax-feature-flag'

interface StudyRequestPageHeaderProps {
    orgSlug: string
}

export const StudyRequestPageHeader: FC<StudyRequestPageHeaderProps> = ({ orgSlug }) => {
    return (
        <OpenStaxFeatureFlag
            defaultContent={
                <>
                    <ResearcherBreadcrumbs crumbs={{ orgSlug, current: 'Propose a study' }} />
                    <Title order={1}>Propose a study</Title>
                </>
            }
            optInContent={
                <>
                    <ResearcherBreadcrumbs crumbs={{ orgSlug, current: 'Request data use' }} />
                    <Title order={1}>Request data use</Title>
                </>
            }
        />
    )
}
