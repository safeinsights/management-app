import React from 'react'
import { Flex, Paper, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { EditOrgForm } from '@/components/org/edit-org-form'

export const dynamic = 'force-dynamic'

export default async function ManageOrgPage(props: { params: Promise<{ orgSlug: string }> }) {
    const params = await props.params

    const { orgSlug } = params

    const org = await getOrgFromSlugAction(orgSlug)
    if (!org) {
        return <AlertNotFound title="Organization was not found" message="no such organization exists" />
    }

    return (
        <Paper m="xl" shadow="xs" p="xl">
            <Title mb="lg">Manage {org.name} details</Title>
            <Flex direction="column" gap="lg">
                <EditOrgForm org={org} />
            </Flex>
        </Paper>
    )
}
