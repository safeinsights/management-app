'use client'

import { FC } from 'react'
import { Container, Paper, Stack, Text, Title } from '@mantine/core'
import { ButtonLink, Link } from '@/components/links'
import { Panel } from '@/components/panel'
import { Routes } from '@/lib/routes'

// Presentational MFA status page-view. It owns both states: the "MFA is enabled"
// confirmation card and the enrollment-options card. It is kept in its OWN file (free
// of Clerk's useUser / reload / redirect) so it renders in isolation (e.g. Ladle). The
// ManageMFA container (./manage-mfa) reads the real twoFactorEnabled state and passes
// it via `hasMFA`.
export type ManageMFAViewProps = {
    /** When true, show the success/confirmation card; otherwise show enrollment options. */
    hasMFA: boolean
}

const MFAEnabledCard: FC = () => (
    <Container>
        <Panel title="MFA is enabled">
            <Text>You have successfully enabled MFA on your account</Text>
            <Link href={Routes.home} display="inline-block" mt="md">
                Return to homepage
            </Link>
        </Panel>
    </Container>
)

const EnrollOptionsCard: FC = () => (
    <Paper bg="white" p="xxl" radius="sm" maw={500} my={{ base: '1rem', lg: 0 }}>
        <Stack mb="xxl">
            <Title mb="xs" ta="center" order={3}>
                Secure your account with <br /> Multi-Factor Authentication
            </Title>
            <Text size="md">
                To enhance the security of your account, we’re enforcing two-factor verification at SafeInsights.
            </Text>
            <Text size="md" mb="xs">
                You can choose to receive verification codes via text message (SMS) or use an authenticator app.
            </Text>
            <Stack gap="xl">
                <ButtonLink href={Routes.accountMfaSms} w="100%" size="md" variant="primary">
                    SMS Verification
                </ButtonLink>
                <ButtonLink href={Routes.accountMfaApp} w="100%" variant="outline" size="md">
                    Authenticator app verification
                </ButtonLink>
            </Stack>
        </Stack>
    </Paper>
)

export const ManageMFAView: FC<ManageMFAViewProps> = ({ hasMFA }) => {
    if (hasMFA) return <MFAEnabledCard />

    return <EnrollOptionsCard />
}
