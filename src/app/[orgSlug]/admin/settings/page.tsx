import { Stack, Title } from '@mantine/core'
import { RequireOrgAdmin } from '@/components/require-org-admin'
import { OrganizationSettingsManager } from './organization-settings-manager'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { ApiKeySettingsDisplay } from './api-key-settings-display'
import { CodeEnvs } from './code-envs'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { redirect } from 'next/navigation'
import { isActionError } from '@/lib/errors'
import { Routes } from '@/lib/routes'

export default async function AdminSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await params

    const org = await getOrgFromSlugAction({ orgSlug })

    if (isActionError(org)) {
        redirect(Routes.notFound)
    }

    return (
        <Stack p="md">
            <RequireOrgAdmin />
            <PageBreadcrumbs crumbs={[['Dashboard', Routes.home], ['Admin'], ['Settings']]} />
            <Title order={1} mb="xl">
                Settings
            </Title>

            <OrganizationSettingsManager org={org} />
            <ApiKeySettingsDisplay />
            <CodeEnvs />
        </Stack>
    )
}
