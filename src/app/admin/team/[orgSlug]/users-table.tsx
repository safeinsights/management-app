'use client'

import { useState } from 'react'
import { DataTable } from 'mantine-datatable'
import { useMutation, useQuery } from '@/components/common'
import { getUsersForOrgAction, type OrgUserReturn } from '@/server/actions/org.actions'
import dayjs from 'dayjs'
import { Select, Flex, Text } from '@mantine/core'
import { PERMISSION_LABELS, permissionLabelForUser, ROLE_LABELS, roleLabelForUser } from '@/lib/role'
import { updateUserRoleAction } from '@/server/actions/user.actions'
import { reportMutationError } from '@/components/errors'
import { UserAvatar } from '@/components/user-avatar'
import { InfoTooltip } from '@/components/tooltip'

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
        onError: reportMutationError('Failed to update user role'),
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
                    accessor: 'role',
                    title: (
                        <Flex align="center">
                            <span>Role</span>
                            <InfoTooltip
                                text={
                                    <Flex direction="column">
                                        <Text>Shows someone’s role within the organization:</Text>
                                        <Text>
                                            <b>Researcher</b> – can submit studies and access results
                                        </Text>
                                        <Text>
                                            <b>Reviewer</b> – can review and approve studies
                                        </Text>
                                        <Text>
                                            <b>Multiple</b> – holds both roles
                                        </Text>
                                    </Flex>
                                }
                            />
                        </Flex>
                    ),
                    render: (user: User) => <RoleSelector user={user} onSuccess={refetch} orgSlug={orgSlug} />,
                },
                {
                    title: (
                        <Flex align="center">
                            <span>Permission</span>
                            <InfoTooltip
                                text={
                                    <Flex direction="column">
                                        <Text>Shows someone’s permissions within the organization:</Text>
                                        <Text>
                                            <b>Contributor</b> – full access within their role; no admin privileges
                                        </Text>
                                        <Text>
                                            <b>Administrator</b> – manages team-level settings and contributors
                                        </Text>
                                    </Flex>
                                }
                            />
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
