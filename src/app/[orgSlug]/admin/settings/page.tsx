import { RequireOrgAdmin } from '@/components/require-org-admin'
import { OrganizationSettingsManager } from './organization-settings-manager'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { ApiKeySettingsDisplay } from './api-key-settings-display'
import { CodeEnvs } from './code-envs'
import { DataSources } from './data-sources'
import { OrgSettingsView } from './org-settings-view'
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
        <>
            <RequireOrgAdmin />
            <OrgSettingsView
                orgSettings={<OrganizationSettingsManager org={org} />}
                apiKeys={<ApiKeySettingsDisplay />}
                codeEnvs={<CodeEnvs />}
                dataSources={<DataSources />}
            />
        </>
    )
}
