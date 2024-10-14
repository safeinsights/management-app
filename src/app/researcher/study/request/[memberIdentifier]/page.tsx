import React from 'react'
import { Form } from './form'
import { Flex, List, ListItem, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/alerts'
import { YodaNotice } from './yoda'
import { getMemberFromIdentifier } from '@/server/members'

export default async function MemberHome({ params }: { params: { memberIdentifier: string } }) {
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
                <Title>{member.name} Study Proposal Submission: Step 1</Title>

                <List>
                    <ListItem>Submit proposal for review</ListItem>
                    <ListItem>Once approved, submit your code and refine research proposal</ListItem>
                    <ListItem>
                        Contingent on approval, OpenStax will proceed to make aggregate results available to you
                    </ListItem>
                </List>

                <Form memberId={member.id} memberIdentifier={member.identifier} />
            </Flex>
        </Flex>
    )
}
