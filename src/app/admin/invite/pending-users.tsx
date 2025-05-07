import { Divider, Flex, Text, Button } from '@mantine/core'
import { FC } from 'react'

interface PendingUsersProps {
    pendingUsers: { id: string; email: string }[]
    isLoadingPending: boolean
    reInviteUser: (email: string) => void
    isReinviting: boolean
    reinvitingEmail: string | null
}

export const PendingUsers: FC<PendingUsersProps> = ({
    pendingUsers,
    isLoadingPending,
    reInviteUser,
    isReinviting,
    reinvitingEmail,
}) => {
    return (
        <>
            <Divider c="charcoal.1" my="xl" />
            <div>
                <Text fw={600} mb="md">
                    Pending invitations
                </Text>
                {isLoadingPending ? (
                    <Text size="sm">Loading pending invitations...</Text>
                ) : pendingUsers.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        No pending invitations for this organization.
                    </Text>
                ) : (
                    <Flex direction="column" gap="xs">
                        {pendingUsers.map((user) => (
                            <Flex key={user.id} justify="space-between" align="center">
                                <Text size="sm" truncate>
                                    {user.email}
                                </Text>
                                <Button
                                    variant="outline"
                                    size="xs"
                                    onClick={() => reInviteUser(user.email)}
                                    loading={isReinviting && reinvitingEmail === user.email}
                                    disabled={isReinviting}
                                >
                                    Re-invite
                                </Button>
                            </Flex>
                        ))}
                    </Flex>
                )}
            </div>
        </>
    )
}
