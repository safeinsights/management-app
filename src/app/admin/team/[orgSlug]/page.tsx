import { Paper, Stack, Title, Flex } from '@mantine/core'
import { UsersTable } from './users-table'
import { InviteButton } from './invitation'
import { RequireOrgAdmin } from '@/components/require-org-admin'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'

export const dynamic = 'force-dynamic'

export default async function UsersListingPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    return (
        <Stack p="md">
            <PageBreadcrumbs crumbs={[{ title: 'Admin' }, { title: 'Manage team' }]} />
            <RequireOrgAdmin />
            <Title my="lg">Manage team</Title>
            <Paper shadow="xs" p="xl">
                <Flex direction="row" justify={'space-between'} align="center">
                    <Title order={3} mb="lg">
                        People
                    </Title>
                    <InviteButton orgSlug={orgSlug} />
                </Flex>

                <UsersTable orgSlug={orgSlug} />
            </Paper>
        </Stack>
    )
}
