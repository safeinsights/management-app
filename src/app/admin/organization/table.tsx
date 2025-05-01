'use client'

import { DataTable, type DataTableSortStatus } from 'mantine-datatable'
import * as R from 'remeda'
import { FC, useMemo, useState } from 'react'
import { deleteOrgAction, fetchOrgsAction } from '@/server/actions/org.actions'
import { getNewOrg, type Org } from '@/schema/org'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash, Users } from '@phosphor-icons/react/dist/ssr'
import { ActionIcon, Box, Button, ButtonGroup, Flex, Group, Modal } from '@mantine/core'
import { SuretyGuard } from '@/components/surety-guard'
import { useDisclosure } from '@mantine/hooks'
import { EditOrgForm } from '@/components/org/edit-org-form'
import { ButtonLink } from '@/components/links'
import { ButtonGroupSection } from '@mantine/core'

export function OrgsAdminTable() {
    const { data = [] } = useQuery({
        queryKey: ['orgs'],
        queryFn: fetchOrgsAction,
    })

    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Org>>({
        columnAccessor: 'name',
        direction: 'desc',
    })

    const sortedOrgs = useMemo(() => {
        const newOrgs = R.sortBy(data, R.prop(sortStatus.columnAccessor as keyof Org))
        return sortStatus.direction === 'desc' ? R.reverse(newOrgs) : newOrgs
    }, [data, sortStatus])

    return (
        <Flex direction={'column'}>
            <DataTable
                withTableBorder
                withColumnBorders
                idAccessor="slug"
                noRecordsText="No organisations yet, add some using button below"
                noRecordsIcon={<Users />}
                records={sortedOrgs}
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

            <AddOrg />
        </Flex>
    )
}

const AddOrg: FC = () => {
    const [opened, { open, close }] = useDisclosure(false)

    return (
        <Flex justify={'end'} mt="lg">
            <Modal opened={opened} onClose={close} title="Add organization" closeOnClickOutside={false}>
                <EditOrgForm org={getNewOrg()} onCompleteAction={close} />
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

const OrgRow: FC<{ org: Org }> = ({ org }) => {
    const queryClient = useQueryClient()
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
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={open}>
                <Pencil />
            </ActionIcon>
            <SuretyGuard onConfirmed={() => deleteOrg(org.slug)}>
                <Trash />
            </SuretyGuard>
        </Group>
    )
}
