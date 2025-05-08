'use client'

import { DataTable, type DataTableSortStatus } from 'mantine-datatable'
import * as R from 'remeda'
import { useMemo, useState } from 'react'
import { fetchOrgsAction } from '@/server/actions/org.actions'
import { type Org, type NewOrg } from '@/schema/org'
import { useQuery } from '@tanstack/react-query'
import { EditOrgForm } from '@/components/org/edit-org-form'
import { Users, Plus, ArrowDown, ArrowUp, Info } from '@phosphor-icons/react/dist/ssr'
import { Button, Divider, Flex, Group, Paper, Stack, Text, Title, useMantineTheme } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { InviteForm } from '@/app/admin/invite/invite-form'
import { AppModal } from '@/components/modal'
import { AdminBreadcrumbs } from '@/components/page-breadcrumbs'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'

const getNewOrg = (): NewOrg => ({
    slug: '',
    name: '',
    email: '',
    publicKey: '',
})

export function OrgsAdminTable() {
    const theme = useMantineTheme()
    const { data = [] } = useQuery({
        queryKey: ['orgs'],
        queryFn: fetchOrgsAction,
    })

    const targetOrgId = useMemo(() => {
        const firstOrg = data.find((org) => org.slug !== CLERK_ADMIN_ORG_SLUG)
        return firstOrg?.id
    }, [data])

    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Org>>({
        columnAccessor: 'name',
        direction: 'asc',
    })

    const sortedOrgs = useMemo(() => {
        const newOrgs = R.sortBy(data, R.prop(sortStatus.columnAccessor as keyof Org))
        return sortStatus.direction === 'desc' ? R.reverse(newOrgs) : newOrgs
    }, [data, sortStatus])

    const [inviteUserOpened, { open: openInviteUser, close: closeInviteUser }] = useDisclosure(false)
    const [addOrgModalOpened, { open: openAddOrgModal, close: closeAddOrgModal }] = useDisclosure(false)

    return (
        <Stack p="xl">
            <AppModal
                isOpen={inviteUserOpened}
                onClose={closeInviteUser}
                title="Invite others to join your team"
                size="lg"
            >
                <InviteForm orgId={targetOrgId || ''} />
            </AppModal>

            <AppModal
                isOpen={addOrgModalOpened}
                onClose={closeAddOrgModal}
                title="Add new organization"
                closeOnClickOutside={false}
                size="lg"
            >
                <EditOrgForm
                    org={getNewOrg()}
                    onCompleteAction={() => {
                        closeAddOrgModal()
                    }}
                />
            </AppModal>

            <AdminBreadcrumbs crumbs={{ current: 'Manage team' }}></AdminBreadcrumbs>
            <Title order={1}>Manage Team</Title>
            <Paper shadow="xs" p="xl">
                <Stack>
                    <Group justify="space-between">
                        <Title order={3}>People</Title>
                        <Flex justify="flex-end">
                            <Button leftSection={<Plus />} onClick={openInviteUser} disabled={!targetOrgId} mr="md">
                                Invite People
                            </Button>
                            <Button leftSection={<Plus />} onClick={openAddOrgModal}>
                                Add new organization
                            </Button>
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
                        records={sortedOrgs}
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
