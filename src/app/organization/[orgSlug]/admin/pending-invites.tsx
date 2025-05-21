import { Flex, Text, Button, Divider } from '@mantine/core'
import { FC } from 'react'
import { getPendingUsersAction, reInviteUserAction } from './admin-users.actions'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LoadingMessage } from '@/components/loading'
import { reportMutationError } from '@/components/errors'
import { notifications } from '@mantine/notifications'

interface PendingUsersProps {
    orgSlug: string
}

const PendingUser: React.FC<{ orgSlug: string; pending: { id: string; email: string } }> = ({ pending, orgSlug }) => {
    const { mutate: reInviteUser, isPending: isReinviting } = useMutation({
        mutationFn: () => reInviteUserAction({ orgSlug, pendingUserId: pending.id }),
        onError: reportMutationError,
        onSuccess() {
            notifications.show({ message: `${pending.email} has been re-invited`, color: 'green' })
        },
    })

    return (
        <Flex justify="space-between" align="center">
            <Text size="sm" truncate>
                {pending.email}
            </Text>
            <Button
                variant="outline"
                size="xs"
                onClick={() => reInviteUser()}
                loading={isReinviting}
                data-pending-id={pending.id}
                data-testid={`re-invite-${pending.email}`}
            >
                Re-invite
            </Button>
        </Flex>
    )
}

export const PendingUsers: FC<PendingUsersProps> = ({ orgSlug }) => {
    const { data: pendingUsers = [], isLoading: isLoadingPending } = useQuery({
        queryKey: ['pendingUsers', orgSlug],
        queryFn: () => getPendingUsersAction({ orgSlug }),
    })

    return (
        <>
            <Divider c="charcoal.1" my="xl" />
            <div data-testid="pending-invites">
                <Text fw={600} mb="md">
                    Pending invitations
                </Text>
                {isLoadingPending && <LoadingMessage message="Loading pending invitations…" />}
                {!pendingUsers.length && (
                    <Text size="sm" c="dimmed">
                        No pending invitations for this organization.
                    </Text>
                )}

                <Flex direction="column" gap="xs">
                    {pendingUsers.map((pending) => (
                        <PendingUser orgSlug={orgSlug} pending={pending} key={pending.id} />
                    ))}
                </Flex>
            </div>
        </>
    )
}
