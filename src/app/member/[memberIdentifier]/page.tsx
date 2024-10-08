import React from 'react'
import { Form } from './form'
import { db } from '@/database'
import { Flex, Text } from '@mantine/core'
import { AlertNotFound } from '@/components/alerts'

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
