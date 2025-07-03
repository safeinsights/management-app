'use server'

import React from 'react'
import { AlertNotFound } from '@/components/errors'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { Paper, Stack, Text, Title } from '@mantine/core'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'

import { UserName } from '@/components/user-name'

import { StudiesTable } from './table'

export default async function OrgDashboardPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    const org = await getOrgFromSlugAction(orgSlug)

    if (!org) {
        return <AlertNotFound title="Org was not found" message="no such org exists" />
    }

    const studies = await fetchStudiesForOrgAction({ orgSlug })

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
