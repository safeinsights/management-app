'use client'

import { useMutation, useQuery } from '@/common'
import { reportMutationError } from '@/components/errors'
import { LoadingMessage } from '@/components/loading'
import { AppModal } from '@/components/modal'
import { useUser } from '@clerk/nextjs'
import { Button, Flex, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useRouter } from 'next/navigation'
import { FC, use, useState } from 'react'
import { getOrgInfoForInviteAction, onJoinTeamAccountAction, onRevokeInviteAction } from '../create-account.action'

type InviteProps = {
    params: Promise<{ inviteId: string }>
}

type ConfirmationModalProps = {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isLoading?: boolean
    orgName: string
}

const AddTeam: FC<InviteProps> = ({ params }) => {
    const { inviteId } = use(params)
    const router = useRouter()
    const { user } = useUser()
    const [isDisabled, setIsDisabled] = useState<boolean>(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [isSkipping, setIsSkipping] = useState(false)

    const { data: org, isLoading } = useQuery({
        queryKey: ['orgInfoForInvite', inviteId],
        queryFn: () => getOrgInfoForInviteAction({ inviteId }),
    })

    // Check if logged-in user's email matches the invite email
    const emailMismatch = user && org && user.primaryEmailAddress?.emailAddress !== org.email

    const { mutate: joinTeam, isPending: isJoining } = useMutation({
        mutationFn: () => onJoinTeamAccountAction({ inviteId }),
        onSuccess: () => {
            setIsDisabled(true) // disable button after successful join
            notifications.show({
                color: 'green',
                message: `You have successfully joined ${org!.name}!`,
            })
            router.push(`/${org!.slug}/dashboard`)
        },
        onError: () => {
            reportMutationError('Unable to join team')
        },
    })

    const { mutate: revokeInvite, isPending: isRevoking } = useMutation({
        mutationFn: () => onRevokeInviteAction({ inviteId }),
        onSuccess: () => {
            router.push(`/dashboard?decline=${org!.name}`)
        },
        onError: () => {
            reportMutationError('Unable to decline invitation')
        },
    })

    if (isLoading || !org || !user) {
        return <LoadingMessage message="Loading account invitation" />
    }

    if (emailMismatch) {
        return (
            <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
                <Flex direction="column" maw={500} mx="auto" pb="xxl" gap="md">
                    <Title order={3} ta="center" mb="md" c="red.8">
                        Email Mismatch
                    </Title>
                    <Text size="md">
                        The email address you are logged in with does not match the email address in the invitation.
                    </Text>
                    <Text size="md">
                        Please sign in with the correct account or contact the person who sent the invitation for a new
                        invite.
                    </Text>
                    <Button variant="filled" size="lg" onClick={() => router.push('/account/signin')} mt="md">
                        Sign in
                    </Button>
                </Flex>
            </Paper>
        )
    }

    return (
        <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
            <Flex direction="column" maw={500} mx="auto" pb="xxl" gap="xs">
                <Title order={3} ta="center" mb="md">
                    You’ve been invited to join {org.name}.
                </Title>
                <Text size="md">
                    {org.invitingUserFirstName} {org.invitingUserLastName} has invited you to join {org.name} as a{' '}
                    {org.isAdmin ? 'admin' : 'contributor'}.
                </Text>
                <Text size="md">
                    Join the team to access its dashboard and studies. If opting to skip, you can find the invitation in
                    your email inbox. Note: This invitation will expire in 7 days.
                </Text>
                <Text size="sm" c="red.8" mb="md">
                    <b>Note:</b> This invitation will expire in 7 days.
                </Text>
                <Button variant="filled" size="lg" onClick={() => joinTeam()} loading={isJoining || isDisabled} mb={4}>
                    Accept invitation
                </Button>
                <Button variant="outline" size="lg" onClick={() => setConfirmOpen(true)} mb={4} loading={isRevoking}>
                    Decline invitation
                </Button>

                <ConfirmationModal
                    isOpen={confirmOpen}
                    onClose={() => setConfirmOpen(false)}
                    onConfirm={() => revokeInvite()}
                    isLoading={isRevoking}
                    orgName={org.name}
                />
                <Button
                    variant="subtle"
                    size="lg"
                    loading={isSkipping}
                    w="100%"
                    onClick={() => {
                        if (isSkipping) return
                        setIsSkipping(true)
                        router.push(`/dashboard?skip=${org.name}`)
                    }}
                >
                    Skip for now
                </Button>
            </Flex>
        </Paper>
    )
}

const ConfirmationModal: FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, isLoading = false, orgName }) => (
    <AppModal isOpen={isOpen} onClose={onClose} title="Decline invitation?">
        <Stack>
            <Text size="md">Are you sure you want to decline the invitation to join {orgName}?</Text>
            <Text size="sm" c="red.9">
                <b>Note:</b> If you decline this invitation, you will need to request a new one if you want to join this
                organization later.
            </Text>
            <Group>
                <Button variant="outline" onClick={onClose} size="md">
                    Cancel
                </Button>
                <Button loading={isLoading} onClick={onConfirm} size="md">
                    Decline invitation
                </Button>
            </Group>
        </Stack>
    </AppModal>
)

export default AddTeam
