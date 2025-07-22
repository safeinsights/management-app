'use client'

import { FC } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Flex, Text, Button } from '@mantine/core'
import { onRevokeInviteAction } from './create-account.action'
import { reportMutationError } from '@/components/errors'
import { useRouter } from 'next/navigation'

type InviteProps = {
    inviteId: string
    orgName: string
}

export const AlreadyMember: FC<InviteProps> = ({ inviteId, orgName }) => {
    const router = useRouter()

    const { mutate: revokeInvite, isPending: isJoining } = useMutation({
        mutationFn: () => onRevokeInviteAction({ inviteId }),
        onError: reportMutationError('Unable to join team'),
        onSuccess() {
            router.push('/account/signin')
        },
    })

    return (
        <Flex direction="column" gap="lg" maw={500} mx="auto">
            <Text size="md">You are already a member of {orgName}</Text>
            <Button onClick={() => revokeInvite()} loading={isJoining}>
                Login to visit team page
            </Button>
        </Flex>
    )
}
