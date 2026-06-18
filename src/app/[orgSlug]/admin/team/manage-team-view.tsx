'use client'

import type { ReactNode } from 'react'
import { Flex, Paper, Title } from '@mantine/core'

// Presentational layout for the org-admin Manage team page: the page title plus the
// "People" card (heading + "Invite People" action + the users table). The invite control
// and the table are injected as slots — the real page passes the data containers; a story
// passes presentational stand-ins. No data fetching or session here, so it renders in
// isolation (e.g. Ladle). Returns a fragment so the page's own Stack (with breadcrumbs)
// stays the single layout wrapper, keeping the rendered structure unchanged.
export type ManageTeamViewProps = {
    /** "Invite People" control — the container injects the modal-opening button. */
    inviteAction: ReactNode
    /** People table — the container injects the data-backed UsersTable. */
    table: ReactNode
}

export function ManageTeamView({ inviteAction, table }: ManageTeamViewProps) {
    return (
        <>
            <Title my="lg">Manage team</Title>
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
