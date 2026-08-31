import { Stack } from '@mantine/core'
import { UsersTable } from './users-table'
import { InviteButton } from './invitation'
import { ManageTeamView } from './manage-team-view'

export default async function UsersListingPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    return (
        <Stack p="md">
            <ManageTeamView
                inviteAction={<InviteButton orgSlug={orgSlug} />}
                table={<UsersTable orgSlug={orgSlug} />}
            />
        </Stack>
    )
}
