'use client'

import { DataTable, type DataTableSortStatus } from 'mantine-datatable'
import * as R from 'remeda'
import { useEffect, useState } from 'react'
import { fetchMembersAction, deleteMemberAction } from './actions'
import { type Member, type NewMember, NEW_MEMBER } from './schema'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IconEdit, IconTrash, IconUsers } from '@tabler/icons-react'
import { Button, Flex, Box, Group, ActionIcon } from '@mantine/core'
import { EditModal } from './edit-form'
import { SuretyGuard } from '@/components/surety-guard'

export function MembersAdminTable() {
    const queryClient = useQueryClient()
    const { data } = useQuery({
        queryKey: ['members'],
        initialData: [] as Member[],
        queryFn: () => {
            return fetchMembersAction()
        },
    })
    const { mutate: deleteMember } = useMutation({
        mutationFn: deleteMemberAction,
        onSettled: async () => {
            return await queryClient.invalidateQueries({ queryKey: ['members'] })
        },
    })

    const [editing, setEditing] = useState<Member | NewMember | null>(null)

    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Member>>({
        columnAccessor: 'name',
        direction: 'desc',
    })

    const [members, setMembers] = useState<Member[]>([])

    useEffect(() => {
        const newMembers = R.sortBy(data, R.prop(sortStatus.columnAccessor as keyof Member))
        setMembers(sortStatus.direction === 'desc' ? R.reverse(newMembers) : newMembers)
    }, [sortStatus, data])

    const onEditComplete = () => {
        setEditing(null)
    }

    return (
        <Flex direction={'column'}>
            <DataTable
                withTableBorder
                withColumnBorders
                idAccessor="identifier"
                noRecordsText="No members yet, add some using button below"
                noRecordsIcon={<IconUsers />}
                records={members}
                sortStatus={sortStatus}
                onSortStatusChange={setSortStatus}
                columns={[
                    { accessor: 'identifier', sortable: true },
                    { accessor: 'name', sortable: true },
                    { accessor: 'email', sortable: true, textAlign: 'right' },
                    {
                        accessor: 'actions',
                        width: 80,
                        textAlign: 'center',
                        title: <Box mr={6}>Edit</Box>,
                        render: (member) => (
                            <Group gap={4} justify="center" wrap="nowrap">
                                <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => setEditing(member)}>
                                    <IconEdit size={18} />
                                </ActionIcon>
                                <SuretyGuard onConfirmed={() => deleteMember(member.identifier)}>
                                    <IconTrash size={18} />
                                </SuretyGuard>
                            </Group>
                        ),
                    },
                ]}
            />

            <EditModal editing={editing} onComplete={onEditComplete} />
            <Flex justify={'end'} mt="lg">
                <Button onClick={() => setEditing(NEW_MEMBER)}>Add new Member</Button>
            </Flex>
        </Flex>
    )
}
