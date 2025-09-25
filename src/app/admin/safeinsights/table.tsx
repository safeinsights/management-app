'use client'

import { DataTable, type DataTableSortStatus } from 'mantine-datatable'
import * as R from 'remeda'
import { FC, useMemo, useState } from 'react'
import { deleteOrgAction, fetchOrgsWithStudyCountsAction } from '@/server/actions/org.actions'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { PencilIcon, TrashIcon, UsersIcon } from '@phosphor-icons/react/dist/ssr'
import { ActionIcon, Box, Button, Flex, Group, Modal, Title, Tooltip } from '@mantine/core'
import { SuretyGuard } from '@/components/surety-guard'
import { useDisclosure } from '@mantine/hooks'
import { EditOrgForm } from './edit-org-form'
import { useRouter } from 'next/navigation'
import { ActionSuccessType } from '@/lib/types'
import { UserListIcon } from '@phosphor-icons/react'

type Org = ActionSuccessType<typeof fetchOrgsWithStudyCountsAction>[number]

export function OrgsAdminTable() {
    const { data = [] } = useQuery({
        queryKey: ['orgs'],
        queryFn: fetchOrgsWithStudyCountsAction,
    })

    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Org>>({
        columnAccessor: 'name',
        direction: 'asc',
    })
    const sortedMembers = useMemo(() => {
        const accessor = sortStatus.columnAccessor as keyof Org
        const newOrgs = R.sortBy(
            data as Org[],
            (org: Org) => org[accessor] as string | number | Date | boolean | bigint,
        )
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
                noRecordsIcon={<UsersIcon />}
                records={sortedMembers}
                sortStatus={sortStatus}
                onSortStatusChange={setSortStatus}
                columns={[
                    { accessor: 'slug', sortable: true },
                    { accessor: 'name', sortable: true },
                    { accessor: 'email', sortable: true },
                    { accessor: 'totalStudies', title: '# Studies', textAlign: 'center', sortable: true },
                    {
                        accessor: 'actions',
                        width: 110,
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
                <EditOrgForm onCompleteAction={close} />
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
            <Tooltip label="View Users" withArrow>
                <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="blue"
                    onClick={() => router.push(`/admin/team/${org.slug}`)}
                >
                    <UsersIcon />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="View Studies" withArrow>
                <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="blue"
                    onClick={() => router.push(`/reviewer/${org.slug}/dashboard`)}
                >
                    <UserListIcon />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Edit" withArrow>
                <ActionIcon size="sm" variant="subtle" color="green" onClick={open}>
                    <PencilIcon />
                </ActionIcon>
            </Tooltip>
            <SuretyGuard onConfirmed={() => deleteOrg({ orgId: org.id })}>
                <TrashIcon />
            </SuretyGuard>
        </Group>
    )
}
