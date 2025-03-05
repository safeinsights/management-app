import React from 'react'
import { db } from '@/database'
import { b64toUUID } from '@/lib/uuid'
import { Form } from './form'
import { Flex, List, Title, Text, Container, Paper, Stack } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { YodaNotice } from './yoda'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'

export const dynamic = 'force-dynamic'

export default async function MemberHome(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params
    const member = await getMemberFromIdentifier(params.memberIdentifier)

    const study = await db.selectFrom('study').selectAll().executeTakeFirst()

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
            <Flex w="70%" align="center">
                <Stack w="100%">
                    <Paper p="md">
                        <Title mb="lg">Propose A Study</Title>
                    </Paper>
                    <Flex direction="column" bg="#f5f5f5" shadow="xs" p={80}>
                        <Form memberId={member.id} memberIdentifier={member.identifier} />
                    </Flex>
                </Stack>
            </Flex>
        </>
    )
}
