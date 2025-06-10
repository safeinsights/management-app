import { Paper, Text, CloseButton, Group, Stack } from '@mantine/core'
import Link from 'next/link'

export function VerificationModal({ onCompleteAction, onBack }: { onCompleteAction: () => void; onBack: () => void }) {
    return (
        <Paper bg="white" shadow="none">
            <Paper bg="grey.10" shadow="none" p={'lg'} mt={30} radius="sm">
                <Group justify="space-between" gap="xl">
                    <Text ta="left">Reset Password</Text>
                    <CloseButton aria-label="Close password reset form" onClick={onBack} />
                </Group>
            </Paper>
            <Stack gap="md" p="xl" align="center">
                <Text w={'100%'} ta="center">
                    If this email address is associated with an existing account, you will receive an email verification
                    code to reset your password.
                </Text>

                <Link href="/account/reset-password" onClick={onCompleteAction} style={{ color: 'blue' }}>
                    Proceed to enter verification code
                </Link>
            </Stack>
        </Paper>
    )
}
