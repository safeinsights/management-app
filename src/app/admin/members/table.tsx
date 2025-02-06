'use client'

import { DataTable, type DataTableSortStatus } from 'mantine-datatable'
import * as R from 'remeda'
import { FC, useEffect, useState } from 'react'
import { deleteMemberAction, fetchMembersAction } from '@/server/actions/member-actions'
import { type Member, NEW_MEMBER } from '@/schema/member'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconEdit, IconTrash, IconUsers } from '@tabler/icons-react'
import { ActionIcon, Box, Button, Flex, Group, Modal } from '@mantine/core'
import { SuretyGuard } from '@/components/surety-guard'
import { useDisclosure } from '@mantine/hooks'
import { EditMemberForm } from '@/components/member/edit-member-form'

export function MembersAdminTable() {
    const { data } = useQuery({
        queryKey: ['members'],
        initialData: [] as Member[],
        queryFn: () => {
            return fetchMembersAction()
        },
    })

    console.log('data: ', data);

    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Member>>({
        columnAccessor: 'name',
        direction: 'desc',
    })

    const [members, setMembers] = useState<Member[]>([])

    useEffect(() => {
        const newMembers = R.sortBy(data, R.prop(sortStatus.columnAccessor as keyof Member))
        setMembers(sortStatus.direction === 'desc' ? R.reverse(newMembers) : newMembers)
    }, [sortStatus, data])

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
                            <MemberRow member={member} />
                        ),
                    },
                ]}
            />

            <AddMember />
        </Flex>
    )
}

const AddMember: FC = () => {
    const [opened, { open, close }] = useDisclosure(false)

    return (
        <Flex justify={'end'} mt="lg">
            <Modal opened={opened} onClose={close} title={`Add Member`} closeOnClickOutside={false}>
                <EditMemberForm member={NEW_MEMBER} onCompleteAction={close} />
            </Modal>
            <Button onClick={open}>Add new Member</Button>
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
                <IconEdit size={18} />
            </ActionIcon>
            <SuretyGuard onConfirmed={() => deleteMember(member.identifier)}>
                <IconTrash size={18} />
            </SuretyGuard>
        </Group>
    )
}
