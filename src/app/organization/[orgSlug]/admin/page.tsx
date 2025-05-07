import { Button, Paper, Stack, Text, Title, Flex } from '@mantine/core'

import { UsersTable } from './users-table'

export const dynamic = 'force-dynamic'

export default async function UsersListingPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    return (
        <Stack p="md">
            <Title>Manage team</Title>
            <Text>
                <strong>Welcome to your SafeInsights dashboard!</strong> Here you can find study proposals submitted to
                your organization, view their status and know when you need to take action. We continuously iterate to
                improve your experience and welcome your feedback.
            </Text>
            <Paper shadow="xs" p="xl">
                <Flex direction="row" justify={'space-between'} align="center">
                    <Title mb="lg">People</Title>
                    <Button>Invite People</Button>
                </Flex>

                <UsersTable orgSlug={orgSlug} />
            </Paper>
        </Stack>
    )
}
