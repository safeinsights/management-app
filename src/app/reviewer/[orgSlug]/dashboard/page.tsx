'use server'

import React from 'react'
import { Paper, Stack, Text, Title } from '@mantine/core'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'
import { UserName } from '@/components/user-name'
import { StudiesTable } from './table'
import { errorToString, isActionError } from '@/lib/errors'

export default async function OrgDashboardPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

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
        <Stack p="md">
            <Title>
                Hi <UserName />!
            </Title>
            <Text>
                <strong>Welcome to your SafeInsights dashboard!</strong> Here you can find study proposals submitted to
                your organization, view their status and know when you need to take action. We continuously iterate to
                improve your experience and welcome your feedback.
            </Text>
            <Paper shadow="xs" p="xl">
                <StudiesTable studies={studies} orgSlug={orgSlug} />
            </Paper>
        </Stack>
    )
}
