'use client'

import { ButtonLink } from '@/components/links'
import { useUser } from '@clerk/nextjs'
import { Paper, Stack, Text, Title, Divider } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { redirect } from 'next/navigation'

const HasMFA = () => {
    return (
        <Container>
            <Paper bg="white" p="xxl" radius="none" maw={500} my={{ base: '1rem', lg: 0 }}>
                <Stack mb="lg">
                    <Title mb="xs" ta="center" order={3}>
                        Multi-factor authentication <br />
                        is set up successfully!
                    </Title>
                    <Text size="md">
                        Multi-Factor Authentication (MFA) has been successfully set up using one of your recovery codes.
                    </Text>
                    <Text size="md" mb="xs" c="red.9">
                        Note: You still have remaining recovery codes available. If needed, you can generate a new set
                        at any time from your account settings.
                    </Text>
                    <ButtonLink href="/" size="md" fullWidth>
                        Go to dashboard
                    </ButtonLink>
                </Stack>
            </Paper>
        </Container>
    )
}

export const dynamic = 'force-dynamic'

export function ManageMFA() {
    const { isLoaded, user } = useUser()

    if (!isLoaded) return null

    if (!user) {
        notifications.show({ message: 'You must be logged in to access this page', color: 'blue' })
        return redirect('/')
    }

    if (user.twoFactorEnabled && !window.location.search.includes('TESTING_FORCE_NO_MFA')) return <HasMFA />

    return (
        <Paper bg="white" p="xxl" radius="sm" maw={500} my={{ base: '1rem', lg: 0 }}>
            <Stack mb="xxl">
                <Title mb="xs" ta="center" order={3}>
                    Secure your account with <br /> Multi-Factor Authentication
                </Title>
                <Text size="md">
                    To enhance the security of your account, we&apos;re enforcing two-factor verification at
                    SafeInsights.
                </Text>
                <Text size="md" mb="xs">
                    You can choose to receive verification codes via text message (SMS) or use an authenticator app.
                </Text>
                <Stack gap="xl">
                    <ButtonLink href="/account/mfa/sms" w="100%" size="md" variant="primary">
                        SMS Verification
                    </ButtonLink>
                    <ButtonLink href="/account/mfa/app" w="100%" variant="outline" size="md">
                        Authenticator app verification
                    </ButtonLink>
                    <Divider />
                    <Text fz="md" color="grey.7">
                        Can’t access your MFA device?
                    </Text>
                    <ButtonLink href="/account/mfa/recovery" size="md" variant="outline" fullWidth>
                        Try recovery code
                    </ButtonLink>
                </Stack>
            </Stack>
        </Paper>
    )
}
