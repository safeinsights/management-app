'use client'

import type { ReactNode } from 'react'
import { Divider, Flex, Text } from '@mantine/core'
import { LoadingMessage } from '@/components/loading'

// Presentational "Pending invitations" list. It owns the section chrome (divider, title,
// loading / empty / populated states) and each row's email; the Re-invite / revoke
// controls are injected by the container (./pending-invites), which owns those mutations.
// No data fetching here, so it renders in isolation (e.g. Ladle).
export type PendingInviteView = {
    id: string
    email: string
}

export type PendingInvitesViewProps = {
    pendingUsers: PendingInviteView[]
    isLoading?: boolean
    /** Re-invite / revoke controls — injected per row by the container. */
    renderActions: (pending: PendingInviteView) => ReactNode
}

export function PendingInvitesView({ pendingUsers, isLoading = false, renderActions }: PendingInvitesViewProps) {
    return (
        <>
            <Divider c="charcoal.1" my="xl" />
            <div data-testid="pending-invites">
                <Text fw={600} mb="md">
                    Pending invitations
                </Text>
                {isLoading && <LoadingMessage message="Loading pending invitations…" />}
                {!isLoading && !pendingUsers.length && (
                    <Text size="sm" c="dimmed">
                        No pending invitations for this organization.
                    </Text>
                )}

                <Flex direction="column" gap="xs">
                    {pendingUsers.map((pending) => (
                        <Flex key={pending.id} justify="space-between" align="center">
                            <Text size="sm" truncate>
                                {pending.email}
                            </Text>
                            <Flex gap="xs">{renderActions(pending)}</Flex>
                        </Flex>
                    ))}
                </Flex>
            </div>
        </>
    )
}
