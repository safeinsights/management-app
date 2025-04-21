'use server'

import React from 'react'
import { Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposal } from './study-proposal'
import { getMemberFromSlugAction } from '@/server/actions/member.actions'

export default async function MemberHomePage(props: { params: Promise<{ memberSlug: string }> }) {
    const params = await props.params
    const member = await getMemberFromSlugAction(params.memberSlug)

    if (!member) {
        return <AlertNotFound title="Member not found" message={`Member with slug ${params.memberSlug} not found`} />
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs crumbs={{ current: 'Propose A Study' }} />
            <Title order={1}>Propose A Study</Title>
            <StudyProposal memberSlug={params.memberSlug} />
        </Stack>
    )
}
