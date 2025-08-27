'use client'

import * as React from 'react'
import { Group, Stack, Text, Title } from '@mantine/core'

import { UserName } from '@/components/user-name'
import { StudiesTable } from './table'
export const dynamic = 'force-dynamic'

export default function ResearcherDashboardPage(): React.ReactElement {
    return (
        <Stack p="xl">
            <Title order={1}>
                Hi <UserName />!
            </Title>
            <Group gap="sm">
                <Title order={4}>Welcome to SafeInsights!</Title>
                <Text>
                    This is your dashboard. Here, you can submit new research proposals, view their status and access
                    its details. We continuously iterate to improve your experience and welcome your feedback.
                </Text>
            </Group>
            <StudiesTable />
        </Stack>
    )
}
