import { Stack, Text, Title } from '@mantine/core'
import * as React from 'react'

import { ResearcherStudiesTable } from '@/components/dashboard/researcher-table'
import { ErrorAlert } from '@/components/errors'
import { UserName } from '@/components/user-name'
import { errorToString, isActionError } from '@/lib/errors'
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
        <Stack p="xxl">
            <Title order={1} mt="xxl">
                Hi, <UserName />!
            </Title>
            <Text mb="xxl">
                Welcome to the researcher dashboard. You can submit new proposals, view study status, and access the
                details of each study here. We continuously iterate to improve your experience and welcome your
                feedback.
            </Text>
            <ResearcherStudiesTable />
        </Stack>
    )
}
