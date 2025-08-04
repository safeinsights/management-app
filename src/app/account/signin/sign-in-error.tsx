import { InputError } from '@/components/errors'
import { Stack, Flex, CloseButton, Text, useMantineTheme } from '@mantine/core'
import { FC } from 'react'

interface SignInErrorProps {
    clerkError: { title: string; message: string } | null
    setClerkError: (error: { title: string; message: string } | null) => void
}
export const SignInError: FC<SignInErrorProps> = ({ clerkError, setClerkError }) => {
    const theme = useMantineTheme()
    if (!clerkError) return null

    return (
        <InputError
            error={
                <Stack justify="space-between" gap="xs">
                    <Flex direction="row" justify="space-between" align="flex-start">
                        <Text ta="left" c="red" fw="bold">
                            {clerkError.title}
                        </Text>
                        <CloseButton
                            c={theme.colors.red[7]}
                            aria-label="Close password reset form"
                            onClick={() => setClerkError(null)}
                        />
                    </Flex>
                    <Text size="md">{clerkError.message}</Text>
                </Stack>
            }
        />
    )
}
