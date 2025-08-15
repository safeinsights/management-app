'use server'

import React from 'react'
import { Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposal } from './study-proposal'
import { sessionFromClerk } from '@/server/clerk'

export default async function OrgHomePage(props: { params: Promise<{ orgSlug: string }> }) {
    const params = await props.params

    const session = await sessionFromClerk()

    if (session?.team.slug !== params.orgSlug) {
        return (
            <Stack p="xl" gap="xl">
                <PageBreadcrumbs crumbs={[{ title: 'Propose a study' }]} />
                <AlertNotFound
                    title="Access Denied"
                    message="You are not authorized to propose studies for this organization."
                />
            </Stack>
        )
    }

    return (
        <Stack p="xl" gap="xl">
            <PageBreadcrumbs crumbs={[{ title: 'Propose a study' }]} />
            <Title order={1}>Propose a study</Title>
            <StudyProposal orgSlug={params.orgSlug} />
        </Stack>
    )
}
