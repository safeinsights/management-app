import { Stack } from '@mantine/core'
import { redirect } from 'next/navigation'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { UsersTable } from './users-table'
import { InviteButton } from './invitation'
import { ManageTeamView } from './manage-team-view'

export default async function UsersListingPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    const org = await getOrgFromSlugAction({ orgSlug })
    if (isActionError(org)) {
        redirect(Routes.notFound)
    }

    return (
        <Stack p="md">
            <ManageTeamView
                orgName={displayOrgName(org.name)}
                inviteAction={<InviteButton orgSlug={orgSlug} />}
                table={<UsersTable orgSlug={orgSlug} />}
            />
        </Stack>
    )
}
