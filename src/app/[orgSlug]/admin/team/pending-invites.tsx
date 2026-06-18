import { onRevokeInviteAction } from '@/app/account/invitation/[inviteId]/create-account.action'
import { reportMutationError } from '@/components/errors'
import { ActionIcon, Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { XIcon } from '@phosphor-icons/react/dist/ssr'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { FC } from 'react'
import { getPendingUsersAction, reInviteUserAction } from './admin-users.actions'
import { PendingInvitesView } from './pending-invites-view'

interface PendingUsersProps {
    orgSlug: string
}

const PendingUserActions: React.FC<{ orgSlug: string; pending: { id: string; email: string } }> = ({
    pending,
    orgSlug,
}) => {
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
        <>
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
        </>
    )
}

export const PendingUsers: FC<PendingUsersProps> = ({ orgSlug }) => {
    const { data: pendingUsers = [], isLoading: isLoadingPending } = useQuery({
        queryKey: ['pendingUsers', orgSlug],
        queryFn: () => getPendingUsersAction({ orgSlug }),
    })

    return (
        <PendingInvitesView
            pendingUsers={pendingUsers}
            isLoading={isLoadingPending}
            renderActions={(pending) => <PendingUserActions orgSlug={orgSlug} pending={pending} />}
        />
    )
}
