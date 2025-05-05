'use server'

import React from 'react'
import { Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposal } from './study-proposal'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/database'

export default async function OrgHomePage(props: { params: Promise<{ orgSlug: string }> }) {
    const params = await props.params
    const org = await getOrgFromSlugAction(params.orgSlug)

    if (!org) {
        return <AlertNotFound title="Org not found" message={`Org with slug ${params.orgSlug} not found`} />
    }

    const authResult = await auth()
    const user = await db.selectFrom('user').select('id').where('clerkId', '=', authResult.userId).executeTakeFirst()

    if (!user) {
        return <AlertNotFound title="User Error" message="Internal user record not found." />
    }

    const memberUser = await db
        .selectFrom('memberUser')
        .select('id')
        .where('userId', '=', user.id)
        .where('memberId', '=', member.id)
        .executeTakeFirst()

    if (!memberUser) {
        return (
            <Stack p="xl" gap="xl">
                <ResearcherBreadcrumbs crumbs={{ current: 'Propose A Study' }} />
                <AlertNotFound
                    title="Access Denied"
                    message={`You are not authorized to submit study proposals to the organization "${member.name}".`}
                />
            </Stack>
        )
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ current: 'Propose A Study' }} />
            <Title order={1}>Propose A Study</Title>
            <StudyProposal orgSlug={params.orgSlug} />
        </Stack>
    )
}
