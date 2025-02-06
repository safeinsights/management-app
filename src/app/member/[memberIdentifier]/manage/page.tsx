import React from 'react'
import { Flex, Paper, Title } from '@mantine/core'
import { db } from '@/database'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/members'
import { EditMemberForm } from '@/app/admin/members/edit-form'

export const dynamic = 'force-dynamic'

export default async function ManageMemberPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const params = await props.params

    const { memberIdentifier } = params

    // TODO check user permissions
    const member = await getMemberFromIdentifier(memberIdentifier)
    if (!member) {
        // TODO Redirect here with a mantine notification? generic 404 page?
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    const studies = await db
        .selectFrom('study')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', memberIdentifier).onRef('study.memberId', '=', 'member.id'),
        )
        .orderBy('study.createdAt', 'desc')
        .select(['study.id', 'piName', 'status', 'title'])
        .where('study.status', '!=', 'INITIATED')
        .execute()

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Title mb="lg">Manage {member.name} details</Title>
            <Flex direction="column" gap="lg">
                <EditMemberForm member={member} onComplete={() => {}} />
            </Flex>
        </Paper>
    )
}
