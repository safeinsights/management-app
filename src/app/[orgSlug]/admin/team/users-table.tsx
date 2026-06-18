'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@/common'
import { getUsersForOrgAction, type OrgUserReturn } from '@/server/actions/org.actions'
import { Select } from '@mantine/core'
import { reportMutationError } from '@/components/errors'
import { permissionLabelForUser, PERMISSION_LABELS } from '@/lib/role'
import { updateUserRoleAction } from '@/server/actions/user.actions'
import { UsersTableView, type TeamSort } from './users-table-view'

type User = OrgUserReturn

const PermissionSelector: React.FC<{ orgSlug: string; user: User; onSuccess: () => void }> = ({
    orgSlug,
    user,
    onSuccess,
}) => {
    const { mutate, isPending, variables } = useMutation({
        mutationFn: ({ user, label }: { user: User; label: string }) =>
            updateUserRoleAction({
                orgSlug,
                userId: user.id,
                isAdmin: label == 'Administrator',
            }),
        onSuccess,
        onError: reportMutationError('Failed to update user permission'),
    })

    return (
        <Select
            disabled={isPending}
            onChange={(label) => label && mutate({ user, label })}
            placeholder="Pick value"
            value={isPending ? variables.label : permissionLabelForUser(user)}
            data={PERMISSION_LABELS}
        />
    )
}

export const UsersTable: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
    const [sort, setSortStatus] = useState<TeamSort>({
        columnAccessor: 'fullName',
        direction: 'asc',
    })

    const {
        data: users,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: ['users-listing', orgSlug, sort],
        queryFn: () =>
            getUsersForOrgAction({ orgSlug, sort: { columnAccessor: 'fullName', direction: sort.direction } }),
    })

    return (
        <UsersTableView
            users={users}
            sort={sort}
            onSortChange={setSortStatus}
            fetching={isLoading}
            renderPermission={(user) => <PermissionSelector user={user} onSuccess={refetch} orgSlug={orgSlug} />}
        />
    )
}
