'use server'

import React from 'react'
import { Flex, Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposal } from './study-proposal'
import { getMemberFromSlugAction } from '@/server/actions/member.actions'

export default async function MemberHomePage(props: { params: Promise<{ memberSlug: string }> }) {
    const params = await props.params
    const member = await getMemberFromSlugAction(params.memberSlug)

    if (!member) {
        return (
            <AlertNotFound title="Member not found" message={`Member with identifier ${params.memberSlug} not found`} />
        )
    }

    return (
        <>
            <ResearcherBreadcrumbs crumbs={{ current: 'Propose A Study' }} />
            <Flex align="center">
                <Stack w="100%">
                    <Title mb="lg" mt="lg">
                        Propose A Study
                    </Title>
                    <StudyProposal memberId={member.id} />
                </Stack>
            </Flex>
        </>
    )
}
