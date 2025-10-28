import { Stack, Title } from '@mantine/core'
import { RequireOrgAdmin } from '@/components/require-org-admin'
import { OrganizationSettingsManager } from './organization-settings-manager'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { ApiKeySettingsDisplay } from './api-key-settings-display'
import { BaseImages } from './base-images'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { redirect } from 'next/navigation'
import { isActionError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await params

    const org = await getOrgFromSlugAction({ orgSlug })

    if (isActionError(org)) {
        redirect('/404')
    }

    return (
        <Stack p="md">
            <RequireOrgAdmin />
            <PageBreadcrumbs crumbs={[['Dashboard', `/`], ['Admin'], ['Settings']]} />
            <Title order={1} mb="xl">
                Settings
            </Title>

            <OrganizationSettingsManager org={org} />
            <ApiKeySettingsDisplay />
            <BaseImages />
        </Stack>
    )
}
