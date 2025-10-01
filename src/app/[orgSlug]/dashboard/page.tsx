'use server'

import { ReviewerStudiesTable } from '@/components/dashboard/reviewer-table'
import { ResearcherStudiesTable } from '@/components/dashboard/researcher-table'
import { errorToString, isActionError } from '@/lib/errors'
import { titleize } from '@/lib/string'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'
import { Paper, Stack, Text, Title } from '@mantine/core'
import { isEnclaveOrg } from '@/lib/types'

export default async function OrgDashboardPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    const org = await getOrgFromSlugAction({ orgSlug })
    if (isActionError(org)) {
        throw new Error(`Organization not found: ${orgSlug}`)
    }
    const orgName = titleize(org.name)

    const studies = await fetchStudiesForOrgAction({ orgSlug })
    if (isActionError(studies)) {
        return (
            <Stack p="md">
                <Title>Error loading studies</Title>
                <Text c="red">{errorToString(studies)}</Text>
            </Stack>
        )
    }
    const isEnclave = isEnclaveOrg(org)
    return (
        <Stack p="xxl" gap="xxl">
            <Title order={1}>{orgName} data enclave dashboard</Title>
            <Text>
                Welcome to the {orgName} data enclave dashboard. You can {isEnclave ? 'review submitted' : 'submit'}{' '}
                study proposals here. Check the status of various studies and know when tasks are due. We continuously
                iterate to improve your experience and welcome your feedback.
            </Text>
            <Paper shadow="xs" p="xl">
                {isEnclave ? <ReviewerStudiesTable studies={studies} orgSlug={orgSlug} /> : <ResearcherStudiesTable />}
            </Paper>
        </Stack>
    )
}
