'use server'

import React from 'react'
import { Flex, Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposal } from './study-proposal'
import { getMemberFromIdentifierAction } from '@/server/actions/member.actions'

export default async function MemberHomePage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params
    const member = await getMemberFromIdentifierAction(params.memberIdentifier)

    if (!member) {
        return (
            <AlertNotFound
                title="Member not found"
                message={`Member with identifier ${params.memberIdentifier} not found`}
            />
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
