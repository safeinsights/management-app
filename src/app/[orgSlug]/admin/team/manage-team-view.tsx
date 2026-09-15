'use client'

import type { ReactNode } from 'react'
import { Flex, Paper, Title } from '@mantine/core'
import { PageHeader } from '@/components/page-header'

// The invite control and users table are injected as slots, so this renders without data or a
// session (e.g. Ladle).
export type ManageTeamViewProps = {
    orgName: string
    inviteAction: ReactNode
    table: ReactNode
}

export function ManageTeamView({ orgName, inviteAction, table }: ManageTeamViewProps) {
    return (
        <>
            <PageHeader eyebrow={orgName} title="Manage team" />
            <Paper shadow="xs" p="xl">
                <Flex direction="row" justify="space-between" align="center">
                    <Title order={3} mb="lg">
                        People
                    </Title>
                    {inviteAction}
                </Flex>
                {table}
            </Paper>
        </>
    )
}
