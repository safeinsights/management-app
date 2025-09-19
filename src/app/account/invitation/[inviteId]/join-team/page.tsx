'use client'

import { useMutation, useQuery } from '@/common'
import { reportMutationError } from '@/components/errors'
import { LoadingMessage } from '@/components/loading'
import { Button, Flex, Paper, Text, Title } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { FC, use, useState } from 'react'
import { getOrgInfoForInviteAction, onJoinTeamAccountAction } from '../create-account.action'

type InviteProps = {
    params: Promise<{ inviteId: string }>
}

const AddTeam: FC<InviteProps> = ({ params }) => {
    const { inviteId } = use(params)
    const router = useRouter()
    const [isDisabled, setIsDisabled] = useState<boolean>(false)

    const { data: org, isLoading } = useQuery({
        queryKey: ['orgInfoForInvite', inviteId],
        queryFn: () => getOrgInfoForInviteAction({ inviteId }),
    })

    const { mutate: joinTeam, isPending: isJoining } = useMutation({
        mutationFn: () => onJoinTeamAccountAction({ inviteId }),
        onSuccess: () => {
            setIsDisabled(true) // disable button after successful join
            router.push('/account/signin')
        },
        onError: () => {
            reportMutationError('Unable to join team')
        },
    })

    if (isLoading || !org) {
        return <LoadingMessage message="Loading account invitation" />
    }

    return (
        <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
            <Flex direction="column" gap="lg" maw={500} mx="auto">
                <Title mb="lg" order={3} ta="center">
                    Welcome To SafeInsights!
                </Title>
                <Text size="md" ta="center">
                    You&apos;re now a member of {org.name}
                </Text>
                <Button onClick={() => joinTeam()} loading={isJoining || isDisabled}>
                    Visit your {org.name} dashboard
                </Button>
            </Flex>
        </Paper>
    )
}

export default AddTeam
