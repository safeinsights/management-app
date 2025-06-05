import { Stack, Text, Title, Breadcrumbs, Divider } from '@mantine/core'
import { Link } from '@/components/links'
import { RequireOrgAdmin } from '@/components/require-org-admin'
import { OrganizationSettingsManager } from './organization-settings-manager'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { ApiKeySettingsDisplay } from './api-key-settings-display'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await params
    const org = await getOrgFromSlugAction(orgSlug)

    const items = [
        <Link href={`/admin/team/${orgSlug}`} key="1">
            Dashboard
        </Link>,
        <Text key="2">Admin</Text>,
        <Text key="3" aria-current="page">
            Settings
        </Text>,
    ]

    return (
        <Stack p="md">
            <RequireOrgAdmin />
            <Breadcrumbs>{items}</Breadcrumbs>
            <Divider />
            <Title order={1} mb="xl">
                Settings
            </Title>

            <OrganizationSettingsManager org={org} />
            <ApiKeySettingsDisplay />
        </Stack>
    )
}
