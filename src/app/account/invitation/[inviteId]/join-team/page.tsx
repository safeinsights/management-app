'use client'

import { FC, use, useEffect } from 'react'
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
    const router = useRouter()

    const { data: org, isLoading } = useQuery({
        queryKey: ['orgInfoForInvite', inviteId],
        queryFn: () => getOrgInfoForInviteAction({ inviteId }),
    })

    const { mutate: joinTeam, isPending: isJoining } = useMutation({
        mutationFn: () => onJoinTeamAccountAction({ inviteId }),
        onError: reportMutationError('Unable to join team'),
    })

    useEffect(() => {
        if (org && !isLoading) {
            joinTeam()
        }
    }, [org, isLoading])

    if (isLoading || !org) {
        return <LoadingMessage message="Loading account invitation" />
    }

    return (
        <Flex direction="column" gap="lg" maw={500} mx="auto">
            <Text size="md" ta="center">
                You&apos;re now a member of {org.name}
            </Text>
            <Button onClick={() => router.push('/account/signin')} loading={isJoining}>
                Visit your dashboard
            </Button>
        </Flex>
    )
}

export default AddTeam
