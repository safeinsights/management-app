'use client'

import type { ReactNode } from 'react'
import { Flex, Text } from '@mantine/core'
import { DataTable } from 'mantine-datatable'
import { InfoIcon } from '@phosphor-icons/react'
import dayjs from 'dayjs'
import { InfoTooltip } from '@/components/tooltip'
import { UserAvatar } from '@/components/user-avatar'
import type { OrgUserReturn } from '@/server/actions/org.actions'

// Presentational "People" table. Renders the DataTable, the Full Name cell (avatar + name +
// email), the Last active cell, and the Permission column header — but NOT the per-row
// permission mutation, which the container injects via `renderPermission`. Uses the shared
// <UserAvatar> (Clerk-aware); Ladle renders it through the .ladle Clerk shim.

type User = OrgUserReturn

export type TeamSort = { columnAccessor: string; direction: 'asc' | 'desc' }

const PermissionHeader = (
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
)

const FullNameCell: React.FC<{ user: User }> = ({ user }) => (
    <Flex align="center" gap="lg">
        <UserAvatar user={user} />
        <Flex direction="column">
            <Text c="dark.9">{user.fullName}</Text>
            <Text size="sm" c="gray.7">
                {user.email}
            </Text>
        </Flex>
    </Flex>
)

export type UsersTableViewProps = {
    users?: User[]
    sort: TeamSort
    onSortChange: (sort: TeamSort) => void
    fetching?: boolean
    /** Permission dropdown — injected by the container (it owns the role mutation). */
    renderPermission: (user: User) => ReactNode
}

export function UsersTableView({ users, sort, onSortChange, fetching, renderPermission }: UsersTableViewProps) {
    return (
        <DataTable
            sortStatus={sort}
            minHeight={100}
            rowBackgroundColor={() => 'white'}
            onSortStatusChange={onSortChange}
            columns={[
                {
                    title: 'Full Name',
                    accessor: 'fullName',
                    sortable: true,
                    render: (user: User) => <FullNameCell user={user} />,
                },
                {
                    title: PermissionHeader,
                    accessor: 'permission',
                    render: (user: User) => renderPermission(user),
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
            fetching={fetching}
            records={users}
        />
    )
}
