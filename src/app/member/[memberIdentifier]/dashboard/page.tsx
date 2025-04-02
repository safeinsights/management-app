'use server'

import React from 'react'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifierAction } from '@/server/actions/member.actions'
import { Divider, Stack, Text, Title } from '@mantine/core'
import { StudiesTable } from '@/app/member/[memberIdentifier]/dashboard/studies-table'
import { currentUser } from '@clerk/nextjs/server'

export default async function MemberDashboardPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const { memberIdentifier } = await props.params
    const user = await currentUser()

    const member = await getMemberFromIdentifierAction(memberIdentifier)

    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    return (
        <Stack p="md">
            <Title>Hi {user?.firstName}!</Title>
            <Text>
                Welcome to your SafeInsights dashboard! Here you can find study proposals submitted to your
                organization, view their status and know when you need to take action. We continuously iterate to
                improve your experience and welcome your feedback.
            </Text>
            <Divider />
            <StudiesTable member={member} />
        </Stack>
    )
}
