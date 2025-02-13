import React from 'react'
import { Form } from './form'
import { Flex, List, Title, Text } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { YodaNotice } from './yoda'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'

export const dynamic = 'force-dynamic'

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
        <Flex justify="center">
            <YodaNotice />
            <Flex direction="column">
                <Title>{member.name} Proposal Step 1)</Title>

                <List>
                    <Text mt={20} mb={20} pt={10} fz="lg" fs="italic">
                        {'{'}For the Pilot, detailed research proposal fields are skipped{'}'}
                    </Text>
                </List>

                <Form memberId={member.id} memberIdentifier={member.identifier} />
            </Flex>
        </Flex>
    )
}
