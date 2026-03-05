import { onRevokeInviteAction } from '@/app/account/invitation/[inviteId]/create-account.action'
import { reportMutationError } from '@/components/errors'
import { LoadingMessage } from '@/components/loading'
import { ActionIcon, Button, Divider, Flex, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { XIcon } from '@phosphor-icons/react/dist/ssr'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { FC } from 'react'
import { getPendingUsersAction, reInviteUserAction } from './admin-users.actions'

interface PendingUsersProps {
    orgSlug: string
}

const PendingUser: React.FC<{ orgSlug: string; pending: { id: string; email: string } }> = ({ pending, orgSlug }) => {
    const queryClient = useQueryClient()
    const { mutate: reInviteUser, isPending: isReinviting } = useMutation({
        mutationFn: () => reInviteUserAction({ orgSlug, pendingUserId: pending.id }),
        onError: reportMutationError('Failed to re-invite user'),
        onSuccess() {
            notifications.show({ message: `${pending.email} has been re-invited`, color: 'green' })
        },
    })

    const { mutate: revokeInvite, isPending: isDeleting } = useMutation({
        mutationFn: () => onRevokeInviteAction({ inviteId: pending.id }),
        onError: reportMutationError('Failed to revoke invite'),
        onSuccess() {
            notifications.show({ message: `The invite for ${pending.email} has been revoked`, color: 'green' })
            queryClient.invalidateQueries({ queryKey: ['pendingUsers', orgSlug] })
        },
    })

    return (
        <Flex justify="space-between" align="center">
            <Text size="sm" truncate>
                {pending.email}
            </Text>
            <Flex gap="xs">
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
                <ActionIcon
                    variant="default"
                    onClick={() => revokeInvite()}
                    loading={isDeleting}
                    data-pending-id={pending.id}
                    data-testid={`delete-${pending.email}`}
                    title="Revoke invite"
                >
                    <XIcon size={12} />
                </ActionIcon>
            </Flex>
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
                {!isLoadingPending && !pendingUsers.length && (
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
