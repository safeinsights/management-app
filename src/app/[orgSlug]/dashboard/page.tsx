'use server'

import { StudiesTable } from '@/components/dashboard/studies-table'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { isActionError } from '@/lib/errors'
import { orgInitials, displayOrgName } from '@/lib/string'
import { isEnclaveOrg } from '@/lib/types'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { Stack, Text, Title } from '@mantine/core'

export default async function OrgDashboardPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    const org = await getOrgFromSlugAction({ orgSlug })
    if (isActionError(org)) {
        throw new Error(`Organization not found: ${orgSlug}`)
    }

    const isEnclave = isEnclaveOrg(org)
    const orgInitialsOnly = orgInitials(org.name, org.type, true)
    const orgName = displayOrgName(org.name)

    const description = isEnclave
        ? `Welcome to the ${orgName} Data Organization dashboard. Here you can review submitted study proposals, check study statuses and know when tasks are due.`
        : `Welcome to the ${orgName} Research Lab dashboard. Here you can submit new proposals, view study statuses, and access the details of each study.`

    return (
        <Stack p="xxl" gap="xxl">
            <PageBreadcrumbs
                crumbs={[
                    ['My Dashboard', '/dashboard'],
                    [orgInitialsOnly + (isEnclave ? ' Data Organization' : ' Research Lab')],
                ]}
            />
            <Title order={1}>{orgName + (isEnclave ? ' Data Organization' : ' Research Lab')} dashboard</Title>
            <Text mt="-md">{description}</Text>
            <StudiesTable
                audience={isEnclave ? 'reviewer' : 'researcher'}
                scope="org"
                orgSlug={orgSlug}
                title={isEnclave ? 'Review Studies' : 'Proposed Studies'}
                description={
                    isEnclave
                        ? "Review all the studies submitted to your organization. Studies that need your attention will be labeled 'Needs review'."
                        : undefined
                }
                showNewStudyButton={!isEnclave}
                showRefresher={isEnclave}
                paperWrapper
            />
        </Stack>
    )
}
