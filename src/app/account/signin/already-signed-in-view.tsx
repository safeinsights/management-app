'use client'

import { type FC } from 'react'
import { Button, Paper, Stack, Text, Title } from '@mantine/core'

export interface AlreadySignedInViewProps {
    email: string | null
    isSwitching: boolean
    onContinue: () => void
    onSwitchAccount: () => void
}

const describeSession = (email: string | null) =>
    email ? `You're signed in as ${email}.` : "You're already signed in."

// Presentational only (no Clerk hooks) so it renders in Ladle and unit tests.
export const AlreadySignedInView: FC<AlreadySignedInViewProps> = ({
    email,
    isSwitching,
    onContinue,
    onSwitchAccount,
}) => {
    return (
        <Paper bg="white" p="xxl" radius="sm" w={500} my={{ base: '1rem', lg: 0 }}>
            <Stack gap="xl">
                <Title order={3} ta="center">
                    You’re already signed in
                </Title>
                <Text size="md" ta="center" c="grey.7">
                    {describeSession(email)} Continue to where you were headed, or sign in with a different account.
                </Text>
                <Stack gap="md">
                    <Button size="lg" variant="primary" onClick={onContinue} disabled={isSwitching}>
                        Continue
                    </Button>
                    <Button size="lg" variant="outline" onClick={onSwitchAccount} loading={isSwitching}>
                        Sign in with a different account
                    </Button>
                </Stack>
            </Stack>
        </Paper>
    )
}
