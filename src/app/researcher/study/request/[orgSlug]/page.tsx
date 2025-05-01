'use server'

import React from 'react'
import { Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposal } from './study-proposal'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'

export default async function OrgHomePage(props: { params: Promise<{ orgSlug: string }> }) {
    const params = await props.params
    const org = await getOrgFromSlugAction(params.orgSlug)

    if (!org) {
        return <AlertNotFound title="Org not found" message={`Org with slug ${params.orgSlug} not found`} />
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ current: 'Propose A Study' }} />
            <Title order={1}>Propose A Study</Title>
            <StudyProposal orgSlug={params.orgSlug} />
        </Stack>
    )
}
