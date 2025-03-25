'use server'

import React from 'react'
import { AlertNotFound } from '@/components/errors'

import { getMemberFromIdentifierAction } from '@/server/actions/member.actions'

import { Divider, Stack, Text, Title } from '@mantine/core'
import { StudiesTable } from '@/app/member/[memberIdentifier]/dashboard/studies-table'
import { siUser } from '@/server/db/queries'

export default async function MemberDashboardPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const { memberIdentifier } = await props.params
    const user = await siUser()

    const member = await getMemberFromIdentifierAction(memberIdentifier)

    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    return (
        <Stack px="lg" bg="#F1F3F5">
            <Title>Hi {user.fullName}!</Title>
            <Text>Welcome to SafeInsights</Text>
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
