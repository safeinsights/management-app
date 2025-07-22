'use client'

import { FC, use } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Flex, Text, Button } from '@mantine/core'
import { onRevokeInviteAction, getOrgInfoForInviteAction } from '../create-account.action'
import { reportMutationError } from '@/components/errors'
import { useRouter } from 'next/navigation'
import { LoadingMessage } from '@/components/loading'

type InviteProps = {
    params: Promise<{ inviteId: string }>
}

const AlreadyMember: FC<InviteProps> = ({ params }) => {
    const { inviteId } = use(params)
    const router = useRouter()

    const { data: org, isLoading } = useQuery({
        queryKey: ['orgInfoForInvite', inviteId],
        queryFn: () => getOrgInfoForInviteAction({ inviteId }),
    })

    const { mutate: revokeInvite, isPending: isJoining } = useMutation({
        mutationFn: () => onRevokeInviteAction({ inviteId }),
        onError: reportMutationError('Unable to join team'),
        onSuccess() {
            router.push('/account/signin')
        },
    })

    if (isLoading || !org) {
        return <LoadingMessage message="Loading account invitation" />
    }

    return (
        <Flex direction="column" gap="lg" maw={500} mx="auto">
            <Text size="md">You are already a member of {org.name}</Text>
            <Button onClick={() => revokeInvite()} loading={isJoining}>
                Login to visit team page
            </Button>
        </Flex>
    )
}

export default AlreadyMember
