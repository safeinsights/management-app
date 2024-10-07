import React from 'react'
import { Form } from './form'
import { db } from '@/database'
import { Alert, Flex, Text } from '@mantine/core'
import { IconError404 } from '@tabler/icons-react'

export default async function MemberHome({ params }: { params: { identifier: string } }) {
    const member = await db
        .selectFrom('member')
        .select(['id', 'identifier', 'name'])
        .where('identifier', '=', params.identifier)
        .executeTakeFirst()

    if (!member) {
        return (
            <Alert w="400" m="auto" variant="filled" color="red" icon={<IconError404 />} title="Member not found">
                Member with identifier {params.identifier} not found
            </Alert>
        )
    }

    return (
        <Flex justify="center">
            <Flex direction="column">
                <h1>Welecome to {member.name} data enclave</h1>

                <Text mt="lg">Hmm, a new researcher, you are.</Text>
                <Text>Curious, your mind is, yes. Study the ways of knowledge, you seek.</Text>
                <Text>Patience, you must have, for many bugs encounter, you will.</Text>
                <Text>Questions, ask many, for in the asking, answers revealed, they are.</Text>

                <Form memberId={member.id} memberIdentifier={member.identifier} />
            </Flex>
        </Flex>
    )
}
