'use server'

import { ResearcherStudiesTable } from '@/components/dashboard/researcher-table'
import { ReviewerStudiesTable } from '@/components/dashboard/reviewer-table'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { isActionError } from '@/lib/errors'
import { orgInitials, orgInitialsTitle } from '@/lib/string'
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
    const orgInitialsTitleText = orgInitialsTitle(org.name, org.type)

    const description = isEnclave
        ? `Welcome to the ${orgInitialsOnly} Data Organization dashboard. Here you can review submitted study proposals, check study statuses and know when tasks are due.`
        : `Welcome to the ${orgInitialsOnly} Research Lab dashboard. Here you can submit new proposals, view study statuses, and access the details of each study.`

    return (
        <Stack p="xxl" gap="xxl">
            <PageBreadcrumbs
                crumbs={[
                    ['Dashboard', '/dashboard'],
                    [orgInitialsOnly + (isEnclave ? ' Data Organization' : ' Research Lab')],
                ]}
            />
            <Title order={1}>{orgInitialsTitleText} dashboard</Title>
            <Text>{description}</Text>
            {isEnclave ? <ReviewerStudiesTable orgSlug={orgSlug} /> : <ResearcherStudiesTable />}
        </Stack>
    )
}
