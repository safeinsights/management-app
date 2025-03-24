'use server'

import React from 'react'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { Divider, Stack, Text, Title } from '@mantine/core'
import { StudiesTable } from '@/app/member/[memberIdentifier]/dashboard/studies-table'
import { siUser } from '@/server/queries'

export default async function MemberDashboardPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const { memberIdentifier } = await props.params
    const user = await siUser()

    const member = await getMemberFromIdentifier(memberIdentifier)

    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

    return (
        <Stack px="lg" bg="#F1F3F5">
            <Title>Hi {user.fullName}!</Title>
            <Text>Welcome to SafeInsights</Text>
            <Text>
                We’re so glad to have you. This space was built with your journey in mind. Your contributions are
                essential to maintaining a trusted and secure research environment, and in here, you can easily find and
                review researcher studies submitted to your organization. We’re continuously iterating to improve your
                experience, and we welcome your feedback to help shape the future of SafeInsights.
            </Text>
            <Divider />
            <StudiesTable member={member} />
        </Stack>
    )
}
