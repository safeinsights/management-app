'use client'

import { DataTable, type DataTableSortStatus } from 'mantine-datatable'
import * as R from 'remeda'
import { FC, useMemo, useState } from 'react'
import { deleteMemberAction, fetchMembersAction } from '@/server/actions/member.actions'
import { getNewMember, type Member } from '@/schema/member'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash, Users } from '@phosphor-icons/react/dist/ssr'
import { ActionIcon, Box, Button, ButtonGroup, Flex, Group, Modal } from '@mantine/core'
import { SuretyGuard } from '@/components/surety-guard'
import { useDisclosure } from '@mantine/hooks'
import { EditMemberForm } from '@/components/member/edit-member-form'
import { ButtonLink } from '@/components/links'
import { ButtonGroupSection } from '@mantine/core'

export function MembersAdminTable() {
    const { data = [] } = useQuery({
        queryKey: ['members'],
        queryFn: fetchMembersAction,
    })

    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Member>>({
        columnAccessor: 'name',
        direction: 'desc',
    })

    const sortedMembers = useMemo(() => {
        const newMembers = R.sortBy(data, R.prop(sortStatus.columnAccessor as keyof Member))
        return sortStatus.direction === 'desc' ? R.reverse(newMembers) : newMembers
    }, [data, sortStatus])

    return (
        <Flex direction={'column'}>
            <DataTable
                withTableBorder
                withColumnBorders
                idAccessor="slug"
                noRecordsText="No organisations yet, add some using button below"
                noRecordsIcon={<Users />}
                records={sortedMembers}
                sortStatus={sortStatus}
                onSortStatusChange={setSortStatus}
                columns={[
                    { accessor: 'slug', sortable: true },
                    { accessor: 'name', sortable: true },
                    { accessor: 'email', sortable: true, textAlign: 'right' },
                    {
                        accessor: 'actions',
                        width: 80,
                        textAlign: 'center',
                        title: <Box mr={6}>Edit</Box>,
                        render: (member) => <MemberRow member={member} />,
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
            <Modal opened={opened} onClose={close} title="Add organization" closeOnClickOutside={false}>
                <EditMemberForm member={getNewMember()} onCompleteAction={close} />
            </Modal>
            <ButtonGroup>
                <ButtonGroupSection>
                    <ButtonLink href="/admin/invite">Invite Users</ButtonLink>
                </ButtonGroupSection>
                <Button onClick={open}>Add new organization</Button>
            </ButtonGroup>
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
