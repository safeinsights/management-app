'use client'

import { useState } from 'react'
import { DataTable } from 'mantine-datatable'
import { useMutation, useQuery } from '@tanstack/react-query'
import { getUsersForOrgAction, type OrgUserReturn } from '@/server/actions/org.actions'
import dayjs from 'dayjs'
import { Select, Flex, Text } from '@mantine/core'
import { PERMISSION_LABELS, permissionLabelForUser, ROLE_LABELS, roleLabelForUser } from '@/lib/role'
import { updateUserRoleAction } from '@/server/actions/user.actions'
import { reportMutationError } from '@/components/errors'
import { UserAvatar } from '@/components/user-avatar'

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
                isResearcher: user.isResearcher,
                isReviewer: user.isReviewer,
                isAdmin: label == 'Administrator',
            }),
        onSuccess,
        onError: reportMutationError,
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

const RoleSelector: React.FC<{ orgSlug: string; user: User; onSuccess: () => void }> = ({
    orgSlug,
    user,
    onSuccess,
}) => {
    const {
        mutate: updatePermission,
        isPending,
        variables,
    } = useMutation({
        mutationFn: ({ user, label }: { user: User; label: string }) =>
            updateUserRoleAction({
                orgSlug,
                userId: user.id,
                isResearcher: label == 'Multiple' || label == 'Researcher',
                isReviewer: label == 'Multiple' || label == 'Reviewer',
                isAdmin: user.isAdmin,
            }),
        onSuccess,
        onError: reportMutationError,
    })

    return (
        <Select
            disabled={isPending}
            onChange={(label) => label && updatePermission({ user, label })}
            placeholder="Pick value"
            value={isPending ? variables.label : roleLabelForUser(user)}
            data={user.isAdmin ? ['Multiple'] : ROLE_LABELS}
        />
    )
}

export const UsersTable: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
    const [sort, setSortStatus] = useState<{ columnAccessor: string; direction: 'asc' | 'desc' }>({
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
        <DataTable
            sortStatus={sort}
            minHeight={400}
            onSortStatusChange={setSortStatus}
            columns={[
                {
                    title: 'Name',
                    accessor: 'fullName',
                    sortable: true,
                    render: (user: User) => (
                        <Flex align={'center'} gap="lg">
                            <UserAvatar user={user} />
                            <Flex direction="column">
                                <Text>{user.fullName}</Text>
                                <Text size="sm" c="gray.6">
                                    {user.email}
                                </Text>
                            </Flex>
                        </Flex>
                    ),
                },
                {
                    accessor: 'role',
                    render: (user: User) => <RoleSelector user={user} onSuccess={refetch} orgSlug={orgSlug} />,
                },
                {
                    accessor: 'permission',
                    render: (user: User) => <PermissionSelector user={user} onSuccess={refetch} orgSlug={orgSlug} />,
                },
                {
                    accessor: 'latestActivityAt',
                    title: 'Last active',
                    textAlign: 'right',
                    render: (user: User) =>
                        user.latestActivityAt ? dayjs(user.latestActivityAt).format('MMM DD, YYYY') : 'no activity',
                },
            ]}
            fetching={isLoading}
            records={users}
        />
    )
}
