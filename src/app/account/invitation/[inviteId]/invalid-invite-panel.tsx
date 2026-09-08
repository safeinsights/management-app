import { ButtonLink } from '@/components/links'
import { Routes } from '@/lib/routes'
import { Flex, Paper, Text, Title } from '@mantine/core'

export const InvalidInvitePanel = () => (
    <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
        <Flex direction="column" maw={500} mx="auto" pb="xxl" gap="md">
            <Title order={3} ta="center" c="red.8">
                This invitation is no longer valid
            </Title>
            <Text size="md">
                It may have already been accepted or expired. If you think this is a mistake, contact the person who
                invited you for a new invitation.
            </Text>
            <ButtonLink variant="filled" size="lg" href={Routes.dashboard} fullWidth>
                Go to your dashboard
            </ButtonLink>
        </Flex>
    </Paper>
)
