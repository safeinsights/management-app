'use client'

import { useMutation, useQuery, useQueryClient } from '@/common'
import { SuretyGuard } from '@/components/surety-guard'
import { InfoTooltip } from '@/components/tooltip'
import { Routes } from '@/lib/routes'
import { ActionSuccessType } from '@/lib/types'
import { deleteOrgAction, fetchAdminOrgsWithStatsAction } from '@/server/actions/org.actions'
import { ActionIcon, Box, Button, Flex, Group, Modal, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { UserListIcon } from '@phosphor-icons/react'
import { PencilIcon, TrashIcon, UsersIcon } from '@phosphor-icons/react/dist/ssr'
import { DataTable, type DataTableSortStatus } from 'mantine-datatable'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { FC, useMemo, useState } from 'react'
import * as R from 'remeda'
import { EditOrgForm } from './edit-org-form'

type Org = ActionSuccessType<typeof fetchAdminOrgsWithStatsAction>[number]

export function OrgsAdminTable() {
    const { data = [], isLoading } = useQuery({
        queryKey: ['orgs'],
        queryFn: fetchAdminOrgsWithStatsAction,
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
                fetching={isLoading}
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
                    { accessor: 'totalUsers', title: '# Users', textAlign: 'center', sortable: true },
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
            <InfoTooltip label="View Users" withArrow>
                <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="blue"
                    onClick={() => router.push(`/${org.slug}/admin/team` as Route)}
                >
                    <UsersIcon />
                </ActionIcon>
            </InfoTooltip>
            <InfoTooltip label="View Studies" withArrow>
                <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="blue"
                    onClick={() => router.push(Routes.orgDashboard({ orgSlug: org.slug }))}
                >
                    <UserListIcon />
                </ActionIcon>
            </InfoTooltip>
            <InfoTooltip label="Edit" withArrow>
                <ActionIcon size="sm" variant="subtle" color="green" onClick={open}>
                    <PencilIcon />
                </ActionIcon>
            </InfoTooltip>
            <SuretyGuard onConfirmed={() => deleteOrg({ orgId: org.id })}>
                <TrashIcon />
            </SuretyGuard>
        </Group>
    )
}
