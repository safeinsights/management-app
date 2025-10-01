'use server'

import React from 'react'
import { Stack, Title } from '@mantine/core'
import { AccessDeniedAlert } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposal } from './study-proposal'
import { sessionFromClerk } from '@/server/clerk'

export default async function OrgHomePage(props: { params: Promise<{ orgSlug: string }> }) {
    const params = await props.params

    const session = await sessionFromClerk()
    if (!session) return <AccessDeniedAlert />

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ orgSlug: params.orgSlug, current: 'Propose a study' }} />
            <Title order={1}>Propose a study</Title>
            <StudyProposal orgSlug={params.orgSlug} />
        </Stack>
    )
}
