import { InputError } from '@/components/errors'
import { Stack, Flex, CloseButton, Text } from '@mantine/core'
import { FC } from 'react'
import { fontWeight, semanticColor } from '@/theme/tokens'

interface SignInErrorProps {
    clerkError: { title: string; message: string } | null
    setClerkError: (error: { title: string; message: string } | null) => void
}
export const SignInError: FC<SignInErrorProps> = ({ clerkError, setClerkError }) => {
    if (!clerkError) return null

    return (
        <InputError
            error={
                <Stack justify="space-between" gap="xs">
                    <Flex direction="row" justify="space-between" align="flex-start">
                        <Text ta="left" c={semanticColor('error.text')} fw={fontWeight.bold}>
                            {clerkError.title}
                        </Text>
                        <CloseButton
                            c={semanticColor('error.text')}
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
