'use client'

import { DataTable, type DataTableSortStatus } from 'mantine-datatable'
import * as R from 'remeda'
import { FC, useMemo, useState } from 'react'
import { deleteMemberAction, fetchMembersAction } from '@/server/actions/member.actions'
import { getNewMember, type Member } from '@/schema/member'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash, Users, Plus, ArrowDown, ArrowUp, Info } from '@phosphor-icons/react/dist/ssr'
import { ActionIcon, Button, Divider, Flex, Group, Modal, Paper, Stack, Text, Title } from '@mantine/core'
import { SuretyGuard } from '@/components/surety-guard'
import { useDisclosure } from '@mantine/hooks'
import { EditMemberForm } from '@/components/member/edit-member-form'
import Link from 'next/link'
import { theme } from '@/theme'
import { AdminBreadcrumbs } from '@/components/page-breadcrumbs'

export function MembersAdminTable() {
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
        <>
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
                            backgroundColor={theme.colors.charcoal[1]}
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
        </>
    )
}

const AddMember: FC = () => {
    const [opened, { open, close }] = useDisclosure(false)

    return (
        <Flex justify={'end'} mt="lg">
            <Modal opened={opened} onClose={close} title="Add organization" closeOnClickOutside={false}>
                <EditMemberForm member={getNewMember()} onCompleteAction={close} />
            </Modal>
        </Flex>
    )
}

const MemberRow: FC<{ member: Member }> = ({ member }) => {
    const queryClient = useQueryClient()
    const [opened, { open, close }] = useDisclosure(false)

    const { mutate: deleteMember } = useMutation({
        mutationFn: deleteMemberAction,
        onSettled: async () => {
            return await queryClient.invalidateQueries({ queryKey: ['members'] })
        },
    })

    return (
        <Group gap={4} justify="center" wrap="nowrap">
            <Modal opened={opened} onClose={close} title={`Edit ${member.name}`} closeOnClickOutside={false}>
                <EditMemberForm member={member} onCompleteAction={close} />
            </Modal>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={open}>
                <Pencil />
            </ActionIcon>
            <SuretyGuard onConfirmed={() => deleteMember(member.slug)}>
                <Trash />
            </SuretyGuard>
        </Group>
    )
}
