'use client'

import { useState } from 'react'
import { DataTable } from 'mantine-datatable'
import { useMutation, useQuery } from '@/common'
import { getUsersForOrgAction, type OrgUserReturn } from '@/server/actions/org.actions'
import dayjs from 'dayjs'
import { Flex, Select, Text } from '@mantine/core'
import { UserAvatar } from '@/components/user-avatar'
import { InfoTooltip } from '@/components/tooltip'
import { reportMutationError } from '@/components/errors'
import { permissionLabelForUser, PERMISSION_LABELS } from '@/lib/role'
import { updateUserRoleAction } from '@/server/actions/user.actions'
import { InfoIcon } from '@phosphor-icons/react'

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
            minHeight={100}
            rowBackgroundColor={() => 'white'}
            onSortStatusChange={setSortStatus}
            columns={[
                {
                    title: 'Full Name',
                    accessor: 'fullName',
                    sortable: true,
                    render: (user: User) => (
                        <Flex align={'center'} gap="lg">
                            <UserAvatar user={user} />
                            <Flex direction="column">
                                <Text c="dark.9">{user.fullName}</Text>
                                <Text size="sm" c="gray.7">
                                    {user.email}
                                </Text>
                            </Flex>
                        </Flex>
                    ),
                },
                {
                    title: (
                        <Flex align="center">
                            <span>Permission</span>
                            <InfoTooltip
                                label={
                                    <Flex direction="column">
                                        <Text w="b" mb="xs">
                                            Shows someone’s permissions within the organization:
                                        </Text>
                                        <Text>
                                            <b>Contributor</b> – full access within their role; no admin privileges
                                        </Text>
                                        <Text>
                                            <b>Administrator</b> – manages team-level settings and contributors
                                        </Text>
                                    </Flex>
                                }
                            >
                                <InfoIcon />
                            </InfoTooltip>
                        </Flex>
                    ),
                    accessor: 'permission',
                    render: (user: User) => <PermissionSelector user={user} onSuccess={refetch} orgSlug={orgSlug} />,
                },
                {
                    accessor: 'latestActivityAt',
                    title: 'Last active',
                    textAlign: 'left',
                    render: (user: User) =>
                        user.latestActivityAt
                            ? dayjs(user.latestActivityAt).format('MMM DD, YYYY h:mma')
                            : 'no activity',
                },
            ]}
            fetching={isLoading}
            records={users}
        />
    )
}
