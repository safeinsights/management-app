'use client'

import { FC, use, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Flex, Text, Button } from '@mantine/core'
import { onJoinTeamAccountAction, getOrgInfoForInviteAction } from '../create-account.action'
import { reportMutationError } from '@/components/errors'
import { useRouter } from 'next/navigation'
import { LoadingMessage } from '@/components/loading'

type InviteProps = {
    params: Promise<{ inviteId: string }>
}

const AddTeam: FC<InviteProps> = ({ params }) => {
    const { inviteId } = use(params)
    const [hasJoined, setHasJoined] = useState(false)
    const router = useRouter()

    const { data: org, isLoading } = useQuery({
        queryKey: ['orgInfoForInvite', inviteId],
        queryFn: () => getOrgInfoForInviteAction({ inviteId }),
    })

    const { mutate: joinTeam, isPending: isJoining } = useMutation({
        mutationFn: () => onJoinTeamAccountAction({ inviteId }),
        onError: reportMutationError('Unable to join team'),
        onSuccess() {
            setHasJoined(true)
        },
    })

    if (isLoading || !org) {
        return <LoadingMessage message="Loading account invitation" />
    }

    if (hasJoined) {
        return (
            <Flex direction="column" gap="lg" maw={500} mx="auto">
                <Text size="md">You are now a member of {org.name}</Text>
                <Button onClick={() => router.push('/account/signin')}>Login to visit team page</Button>
            </Flex>
        )
    }

    return (
        <Flex direction="column" gap="lg" maw={500} mx="auto">
            <Text size="md">You&apos;ve been invited to join {org.name}. Click below to accept the invitation.</Text>
            <Button onClick={() => joinTeam()} loading={isJoining}>
                Join Team
            </Button>
        </Flex>
    )
}

export default AddTeam
