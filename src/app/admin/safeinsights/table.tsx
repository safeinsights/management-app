'use client'

import { DataTable, type DataTableSortStatus } from 'mantine-datatable'
import * as R from 'remeda'
import { FC, useMemo, useState } from 'react'
import { deleteOrgAction, fetchOrgsAction } from '@/server/actions/org.actions'
import { getNewOrg, type Org } from '@/schema/org'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash, Users } from '@phosphor-icons/react/dist/ssr'
import { ActionIcon, Box, Button, Flex, Group, Modal, Title } from '@mantine/core'
import { SuretyGuard } from '@/components/surety-guard'
import { useDisclosure } from '@mantine/hooks'
import { EditOrgForm } from './edit-org-form'
import { useRouter } from 'next/navigation'

export function OrgsAdminTable() {
    const { data = [] } = useQuery({
        queryKey: ['orgs'],
        queryFn: fetchOrgsAction,
    })

    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Org>>({
        columnAccessor: 'name',
        direction: 'asc',
    })

    const sortedMembers = useMemo(() => {
        const accessor = sortStatus.columnAccessor as keyof Org
        const newOrgs = R.sortBy(data, (org: Org) => org[accessor] as string | number | Date | boolean)
        return sortStatus.direction === 'desc' ? R.reverse(newOrgs) : newOrgs
    }, [data, sortStatus])

    return (
        <Flex direction={'column'}>
            <AddMember />
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
                        render: (org) => <OrgRow org={org} />,
                    },
                ]}
            />
        </Flex>
    )
}

const AddMember: FC = () => {
    const [opened, { open, close }] = useDisclosure(false)

    return (
        <Flex justify={'space-between'} my="lg" align={'center'}>
            <Title>Organizations</Title>
            <Modal opened={opened} onClose={close} title="Add organization" closeOnClickOutside={false}>
                <EditOrgForm org={getNewOrg()} onCompleteAction={close} />
            </Modal>
            <Button onClick={open}>Add new organization</Button>
        </Flex>
    )
}

const OrgRow: FC<{ org: Org }> = ({ org }) => {
    const queryClient = useQueryClient()
    const router = useRouter()
    const [opened, { open, close }] = useDisclosure(false)

    const { mutate: deleteOrg } = useMutation({
        mutationFn: deleteOrgAction,
        onSettled: async () => {
            return await queryClient.invalidateQueries({ queryKey: ['orgs'] })
        },
    })

    return (
        <Group gap={4} justify="center" wrap="nowrap">
            <Modal opened={opened} onClose={close} title={`Edit ${org.name}`} closeOnClickOutside={false}>
                <EditOrgForm org={org} onCompleteAction={close} />
            </Modal>
            <ActionIcon
                size="sm"
                variant="subtle"
                color="blue"
                onClick={() => router.push(`/admin/team/${org.slug}`)}
            >
                <Users />
            </ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="green" onClick={open}>
                <Pencil />
            </ActionIcon>

            <SuretyGuard onConfirmed={() => deleteOrg(org.slug)}>
                <Trash />
            </SuretyGuard>
        </Group>
    )
}
