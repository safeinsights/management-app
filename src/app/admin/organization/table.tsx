'use client'

import { DataTable, type DataTableSortStatus } from 'mantine-datatable'
import * as R from 'remeda'
import { useMemo, useState } from 'react'
import { fetchMembersAction } from '@/server/actions/member.actions'
import { type Member } from '@/schema/member'
import { useQuery } from '@tanstack/react-query'
import { Users, Plus, ArrowDown, ArrowUp, Info } from '@phosphor-icons/react/dist/ssr'
import { Button, Divider, Flex, Group, Paper, Stack, Text, Title, useMantineTheme } from '@mantine/core'
import { Link } from '@/components/links'
import { AdminBreadcrumbs } from '@/components/page-breadcrumbs'

export function MembersAdminTable() {
    const theme = useMantineTheme()
    const { data = [] } = useQuery({
        queryKey: ['members'],
        queryFn: fetchMembersAction,
    })

    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Member>>({
        columnAccessor: 'name',
        direction: 'asc',
    })

    const sortedMembers = useMemo(() => {
        const newMembers = R.sortBy(data, R.prop(sortStatus.columnAccessor as keyof Member))
        return sortStatus.direction === 'desc' ? R.reverse(newMembers) : newMembers
    }, [data, sortStatus])

    return (
        <Stack p="xl">
            <AdminBreadcrumbs crumbs={{ current: 'Manage team' }}></AdminBreadcrumbs>
            <Title order={1}>Manage Team</Title>
            <Paper shadow="xs" p="xl">
                <Stack>
                    <Group justify="space-between">
                        <Title order={3}>People</Title>
                        <Flex justify="flex-end">
                            <Link href="/admin/invite">
                                <Button leftSection={<Plus />}>Invite People</Button>
                            </Link>
                        </Flex>
                    </Group>
                    <Divider c="charcoal.1" />
                    <DataTable
                        withColumnBorders
                        striped
                        backgroundColor="charcoal.1"
                        idAccessor="slug"
                        noRecordsText="No organisations yet, add some using button below"
                        noRecordsIcon={<Users />}
                        records={sortedMembers}
                        sortStatus={sortStatus}
                        onSortStatusChange={setSortStatus}
                        columns={[
                            { accessor: 'name', sortable: true },
                            {
                                accessor: 'role',
                                sortable: false,
                                title: (
                                    <Group gap="xs">
                                        <Text>Role</Text>
                                        <Info color={theme.colors.blue[7]} weight="fill" />
                                    </Group>
                                ),
                            },
                            {
                                accessor: 'permission',
                                sortable: false,
                                textAlign: 'left',
                                title: (
                                    <Group gap="xs">
                                        <Text>Permission</Text>
                                        <Info color={theme.colors.blue[7]} weight="fill" />
                                    </Group>
                                ),
                            },
                            { accessor: 'last-active', sortable: false, textAlign: 'left' },
                        ]}
                        sortIcons={{
                            sorted: <ArrowDown color={theme.colors.charcoal[7]} />,
                            unsorted: <ArrowUp color={theme.colors.charcoal[7]} />,
                        }}
                    />
                </Stack>
            </Paper>
        </Stack>
    )
}
