'use server'

import { ReviewerStudiesTable } from '@/components/dashboard/reviewer-table'
import { errorToString, isActionError } from '@/lib/errors'
import { titleize } from '@/lib/string'
import { getOrgFromSlugAction, getReviewerPublicKeyAction } from '@/server/actions/org.actions'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'
import { Paper, Stack, Text, Title } from '@mantine/core'
import { redirect } from 'next/navigation'

export default async function OrgDashboardPage(props: { params: Promise<{ orgSlug: string }> }) {
    const key = await getReviewerPublicKeyAction()

    if (!key) {
        redirect('/account/keys')
    }

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

    return (
        <Stack p="xxl" gap="xxl">
            <Title order={1}>{orgName} data enclave dashboard</Title>
            <Text>
                Welcome to the {orgName} data enclave dashboard. You can review submitted study proposals here. Check
                the status of various studies and know when tasks are due. We continuously iterate to improve your
                experience and welcome your feedback.
            </Text>
            <Paper shadow="xs" p="xl">
                <ReviewerStudiesTable studies={studies} orgSlug={orgSlug} />
            </Paper>
        </Stack>
    )
}
