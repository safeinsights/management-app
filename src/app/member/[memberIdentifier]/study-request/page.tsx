import React from 'react'
import { Form } from './form'
import { db } from '@/database'
import { Flex, List, ListItem, Title, Text} from '@mantine/core'
import { AlertNotFound } from '@/components/alerts'
import { YodaNotice } from './yoda'

export default async function MemberHome({ params }: { params: { memberIdentifier: string } }) {
    const member = await db
        .selectFrom('member')
        .select(['id', 'identifier', 'name'])
        .where('identifier', '=', params.memberIdentifier)
        .executeTakeFirst()

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
                    <Title>{member.name} OpenStax Study Proposal Step 1)</Title>

                    <List>
                        {/* <ListItem>Submit proposal for review</ListItem> */}
                        <Text pt={10} fs="italic">{'{'}For the Pilot, detailed research proposal fields are skipped{'}'}</Text>
                        {/* <ListItem>Once approved, submit your code and refine research proposal</ListItem>
                        <ListItem>
                            Contingent on approval, OpenStax will proceed to make aggregate results available to you
                        </ListItem> */}
                    </List>

                    <Form memberId={member.id} memberIdentifier={member.identifier} />
                </Flex>
            </Flex>
    )
}
