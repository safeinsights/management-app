'use client'

import { useUser } from '@clerk/nextjs'
import { Divider, LoadingOverlay, Stack, Text, Title } from '@mantine/core'
import React, { FC } from 'react'
import { Member } from '@/schema/member'
import { StudiesTable } from '@/components/member/studies-table'

export const MemberDashboard: FC<{ member: Member }> = ({ member }) => {
    const { isLoaded, user } = useUser()

    if (!isLoaded) {
        return <LoadingOverlay />
    }

    return (
        <Stack px="lg" gap="lg">
            <Title mb="lg">Hi {user?.firstName}!</Title>
            <Text>Welcome to SafeInsights</Text>
            <Text>Placeholder text</Text>
            <Divider />
            <StudiesTable member={member} />
            <Divider />
        </Stack>
    )
}
