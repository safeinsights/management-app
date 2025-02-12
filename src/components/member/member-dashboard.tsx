'use client'

import { useUser } from '@clerk/nextjs'
import { LoadingOverlay, Stack, Title } from '@mantine/core'
import React, { FC } from 'react'
import { Member } from '@/schema/member'

export const MemberDashboard: FC<{ member: Member }> = ({ member }) => {
    const { isLoaded, user } = useUser()

    if (!isLoaded) {
        return <LoadingOverlay />
    }

    return (
        <Stack px="lg">
            <Title mb="lg">Hi {user?.firstName}!</Title>
        </Stack>
    )
}
