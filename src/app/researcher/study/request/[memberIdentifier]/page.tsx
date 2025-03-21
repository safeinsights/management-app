'use server'

import React from 'react'
import { Flex, Stack, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { StudyProposalFormSteps } from '@/app/researcher/study/request/[memberIdentifier]/study-proposal-form-steps'

export default async function MemberHome(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params
    const member = await getMemberFromIdentifier(params.memberIdentifier)

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
                    <StudyProposalFormSteps memberId={member.id} />
                </Stack>
            </Flex>
        </>
    )
}
