import React from 'react'
import { Flex, Paper, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { EditMemberForm } from '@/components/member/edit-member-form'

export const dynamic = 'force-dynamic'

export default async function ManageMemberPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params

    const { memberIdentifier } = params

    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Title mb="lg">Manage {member.name} details</Title>
            <Flex direction="column" gap="lg">
                <EditMemberForm member={member} />
            </Flex>
        </Paper>
    )
}
