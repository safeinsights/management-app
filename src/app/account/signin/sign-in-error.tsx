import { Paper, Stack, Flex, CloseButton, Text } from '@mantine/core'
import { WarningCircleIcon } from '@phosphor-icons/react'
import { FC } from 'react'

interface SignInErrorProps {
    clerkError: { title: string; message: string } | null
    setClerkError: (error: { title: string; message: string } | null) => void
}
export const SignInError: FC<SignInErrorProps> = ({ clerkError, setClerkError }) => {
    if (!clerkError) return null

    return (
        <Paper
            bg="#FFEFEF"
            shadow="none"
            style={{
                display: 'flex',
                flexDirection: 'row',
            }}
            p="lg"
            mt="lg"
            radius="sm"
        >
            <WarningCircleIcon
                color="red"
                style={{ margin: 3, display: 'flex', alignSelf: 'flex-start', height: '100%' }}
                weight="fill"
                size={20}
            />
            <Stack justify="space-between" gap="xs">
                <Flex direction="row" justify="space-between" align="flex-start">
                    <Text ta="left" c="red" fw="bold">
                        {clerkError.title}
                    </Text>
                    <CloseButton c="red" aria-label="Close password reset form" onClick={() => setClerkError(null)} />
                </Flex>
                <Text>{clerkError.message}</Text>
            </Stack>
        </Paper>
    )
}
