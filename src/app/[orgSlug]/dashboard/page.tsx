'use server'

import type { Metadata } from 'next'
import { StudiesTable } from '@/components/dashboard/studies-table'
import { JoinedOrgBanner } from '@/components/dashboard/joined-org-banner'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { isEnclaveOrg } from '@/lib/types'
import { PageHeader } from '@/components/page-header'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { Stack } from '@mantine/core'
import { redirect } from 'next/navigation'

export async function generateMetadata(): Promise<Metadata> {
    return { title: 'Dashboard' }
}

export default async function OrgDashboardPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    const org = await getOrgFromSlugAction({ orgSlug })
    if (isActionError(org)) {
        redirect(Routes.notFound)
    }

    const isEnclave = isEnclaveOrg(org)
    const orgName = displayOrgName(org.name)

    return (
        <Stack p="xxl" gap="xxl">
            <PageHeader eyebrow={orgName} title="Dashboard" />
            <JoinedOrgBanner />
            <StudiesTable
                audience={isEnclave ? 'reviewer' : 'researcher'}
                scope="org"
                orgSlug={orgSlug}
                title={isEnclave ? 'Studies for review' : 'All studies'}
                description={
                    isEnclave
                        ? 'Track and review studies submitted to your organization. Open a study to view its details, review submitted materials, and submit your decision.'
                        : 'Track every study your organization has created, from draft to completed. Open a study to check its status, view details, or take your next step.'
                }
                showNewStudyButton={!isEnclave}
                showRefresher
                paperWrapper
            />
        </Stack>
    )
}
