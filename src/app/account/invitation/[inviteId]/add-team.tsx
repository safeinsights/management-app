'use client'

import { FC, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Flex, Text, Button } from '@mantine/core'
import { onJoinTeamAccountAction } from './create-account.action'
import { reportMutationError } from '@/components/errors'
import { useRouter } from 'next/navigation'

type InviteProps = {
    inviteId: string
    orgName: string
}

export const AddTeam: FC<InviteProps> = ({ inviteId, orgName }) => {
    const [hasJoined, setHasJoined] = useState(false)
    const router = useRouter()

    const { mutate: joinTeam, isPending: isJoining } = useMutation({
        mutationFn: () => onJoinTeamAccountAction({ inviteId }),
        onError: reportMutationError('Unable to join team'),
        onSuccess() {
            setHasJoined(true)
        },
    })

    if (hasJoined) {
        return (
            <Flex direction="column" gap="lg" maw={500} mx="auto">
                <Text size="md">You&apos;ve joined {orgName}</Text>
                <Button onClick={() => router.push('/account/signin')}>Login to visit team page</Button>
            </Flex>
        )
    }

    return (
        <Flex direction="column" gap="lg" maw={500} mx="auto">
            <Text size="md">
                You&apos;ve been invited to join {orgName}. Click below to accept the invitation and then login to
                access the team.
            </Text>
            <Button onClick={() => joinTeam()} loading={isJoining}>
                Join Team
            </Button>
        </Flex>
    )
}
