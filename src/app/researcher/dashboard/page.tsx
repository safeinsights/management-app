import * as React from 'react'
import { Group, Stack, Text, Title } from '@mantine/core'

import { UserName } from '@/components/user-name'
import { StudiesTable } from './table'
import { ErrorAlert } from '@/components/errors'
import { isActionError, errorToString } from '@/lib/errors'
import { fetchStudiesForCurrentResearcherAction } from '@/server/actions/study.actions'
import { sessionFromClerk } from '@/server/clerk'
export const dynamic = 'force-dynamic'

export default async function ResearcherDashboardPage(): Promise<React.ReactElement> {
    const session = await sessionFromClerk()

    if (!session) {
        return <ErrorAlert error="Your account is not configured correctly. No organizations found" />
    }

    const studies = await fetchStudiesForCurrentResearcherAction()
    if (!studies || isActionError(studies)) {
        return <ErrorAlert error={`Failed to load studies: ${errorToString(studies)}`} />
    }

    return (
        <Stack p="xl">
            <Title order={1}>
                Hi <UserName />!
            </Title>
            <Group gap="sm">
                <Title order={4}>Welcome to SafeInsights!</Title>
                <Text>
                    This is your dashboard. Here, you can submit new research proposals, view their status and access
                    its details. We continuously iterate to improve your experience and welcome your feedback.
                </Text>
            </Group>
            <StudiesTable />
        </Stack>
    )
}
