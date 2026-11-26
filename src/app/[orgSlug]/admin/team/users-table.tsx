'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@/common'
import { getUsersForOrgAction, type OrgUserReturn } from '@/server/actions/org.actions'
import { Select } from '@mantine/core'
import { reportMutationError } from '@/components/errors'
import { permissionLabelForUser, PERMISSION_LABELS } from '@/lib/role'
import { updateUserRoleAction } from '@/server/actions/user.actions'
import { useSession } from '@/hooks/session'
import { UsersTableView, type TeamSort } from './users-table-view'
import { queryKeys } from '@/lib/query-keys'

type User = OrgUserReturn

const PermissionSelector: React.FC<{ orgSlug: string; user: User; isSelf: boolean }> = ({ orgSlug, user, isSelf }) => {
    const { mutate, isPending, variables } = useMutation({
        mutationFn: ({ user, label }: { user: User; label: string }) =>
            updateUserRoleAction({
                orgSlug,
                userId: user.id,
                isAdmin: label == 'Administrator',
            }),
        invalidates: () => [queryKeys.orgUsersAll(orgSlug)],
        onError: reportMutationError('Failed to update user permission'),
    })

    // Changing your own role is refused server-side (OTTER-720), so do not offer it.
    const label = isPending ? variables.label : permissionLabelForUser(user)

    return (
        <Select
            disabled={isPending || isSelf}
            onChange={(label) => label && mutate({ user, label })}
            placeholder="Pick value"
            value={label}
            data={PERMISSION_LABELS}
            title={isSelf ? 'You cannot change your own role' : undefined}
        />
    )
}

export const UsersTable: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
    const { session } = useSession()
    const [sort, setSortStatus] = useState<TeamSort>({
        columnAccessor: 'fullName',
        direction: 'asc',
    })

    const { data: users, isLoading } = useQuery({
        queryKey: queryKeys.orgUsers(orgSlug, sort),
        queryFn: () =>
            getUsersForOrgAction({ orgSlug, sort: { columnAccessor: 'fullName', direction: sort.direction } }),
    })

    return (
        <UsersTableView
            users={users}
            sort={sort}
            onSortChange={setSortStatus}
            fetching={isLoading}
            renderPermission={(user) => (
                <PermissionSelector user={user} isSelf={user.id === session?.user.id} orgSlug={orgSlug} />
            )}
        />
    )
}
