'use server'

import React from 'react'
import { Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposal } from './study-proposal'
import { sessionFromClerk } from '@/server/clerk'
import { getOrgBySlug } from '@/lib/types'

export default async function OrgHomePage(props: { params: Promise<{ orgSlug: string }> }) {
    const params = await props.params

    const session = await sessionFromClerk()

    const targetOrg = session ? getOrgBySlug(session, params.orgSlug) : null

    if (!targetOrg) {
        return (
            <Stack p="xl" gap="xl">
                <ResearcherBreadcrumbs crumbs={{ current: 'Propose a study' }} />
                <AlertNotFound
                    title="Access Denied"
                    message="You are not authorized to propose studies for this organization."
                />
            </Stack>
        )
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ current: 'Propose a study' }} />
            <Title order={1}>Propose a study</Title>
            <StudyProposal />
        </Stack>
    )
}
