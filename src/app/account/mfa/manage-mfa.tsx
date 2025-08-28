'use client'
import { ButtonLink, Link } from '@/components/links'
import { Panel } from '@/components/panel'
import { useUser } from '@clerk/nextjs'
import { Paper, Stack, Text, Title, Container } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { redirect } from 'next/navigation'

const HasMFA = () => {
    return (
        <Container>
            <Panel title="MFA is enabled">
                <Text>You have successfully enabled MFA on your account</Text>
                <Link href="/" display="inline-block" mt="md">
                    Return to homepage
                </Link>
            </Panel>
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
                </Stack>
            </Stack>
        </Paper>
    )
}
