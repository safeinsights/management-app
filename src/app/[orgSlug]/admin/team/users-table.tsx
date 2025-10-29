'use client'

import { useState } from 'react'
import { DataTable } from 'mantine-datatable'
import { useQuery } from '@/common'
import { getUsersForOrgAction, type OrgUserReturn } from '@/server/actions/org.actions'
import dayjs from 'dayjs'
import { Flex, Text } from '@mantine/core'
import { UserAvatar } from '@/components/user-avatar'

type User = OrgUserReturn

export const UsersTable: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
    const [sort, setSortStatus] = useState<{ columnAccessor: string; direction: 'asc' | 'desc' }>({
        columnAccessor: 'fullName',
        direction: 'asc',
    })

    const { data: users, isLoading } = useQuery({
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
