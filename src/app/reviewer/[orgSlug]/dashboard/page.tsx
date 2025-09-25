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
        <Stack p="xxl">
            <Title order={1} mt="xxl">
                Hi! <UserName />!
            </Title>
            <Text mb="xxl">
                Welcome to your dashboard. You can review submitted study proposals here. Check the status of various
                studies and know when tasks are due. We continuously iterate to improve your experience and welcome your
                feedback.
            </Text>
            <Paper shadow="xs" p="xl">
                <StudiesTable studies={studies} orgSlug={orgSlug} />
            </Paper>
        </Stack>
    )
}
