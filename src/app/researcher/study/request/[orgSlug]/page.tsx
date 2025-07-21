'use server'

import React from 'react'
import { Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposal } from './study-proposal'
import { sessionFromClerk } from '@/server/clerk'

export default async function OrgHomePage(props: { params: Promise<{ orgSlug: string }> }) {
    const params = await props.params

    const session = await sessionFromClerk()

    if (session?.team.slug !== params.orgSlug) {
        return (
            <Stack p="xl" gap="xl">
                <ResearcherBreadcrumbs crumbs={{ current: 'Propose a Study' }} />
                <AlertNotFound
                    title="Access Denied"
                    message="You are not authorized to propose studies for this organization."
                />
            </Stack>
        )
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ current: 'Propose a Study' }} />
            <Title order={1}>Propose a Study</Title>
            <StudyProposal orgSlug={params.orgSlug} />
        </Stack>
    )
}
