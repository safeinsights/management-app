'use client'

import { useUser } from '@clerk/nextjs'
import { Divider, Stack, Text, Title } from '@mantine/core'
import React, { FC } from 'react'
import { Member } from '@/schema/member'
import { StudiesTable } from '@/components/member/studies-table'

export const dynamic = 'force-dynamic'

export const MemberDashboard: FC<{ member: Member }> = ({ member }) => {
    const { user } = useUser()

    return (
        <Stack px="lg" bg="#F1F3F5">
            <Title>Hi {user?.firstName}!</Title>
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
