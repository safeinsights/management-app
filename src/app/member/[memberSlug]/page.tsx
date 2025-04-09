import React from 'react'
import { Flex, Paper, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromSlugAction } from '@/server/actions/member.actions'
import { EditMemberForm } from '@/components/member/edit-member-form'

export const dynamic = 'force-dynamic'

export default async function ManageMemberPage(props: { params: Promise<{ memberSlug: string }> }) {
    const params = await props.params

    const { memberSlug } = params

    const member = await getMemberFromSlugAction(memberSlug)
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
