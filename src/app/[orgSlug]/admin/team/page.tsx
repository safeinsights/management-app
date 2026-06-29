import { Stack } from '@mantine/core'
import { UsersTable } from './users-table'
import { InviteButton } from './invitation'
import { ManageTeamView } from './manage-team-view'
import { RequireOrgAdmin } from '@/components/require-org-admin'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { Routes } from '@/lib/routes'

export default async function UsersListingPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    return (
        <Stack p="md">
            <PageBreadcrumbs crumbs={[['Dashboard', Routes.home], ['Admin'], ['Manage team']]} />
            <RequireOrgAdmin />
            <ManageTeamView
                inviteAction={<InviteButton orgSlug={orgSlug} />}
                table={<UsersTable orgSlug={orgSlug} />}
            />
        </Stack>
    )
}
