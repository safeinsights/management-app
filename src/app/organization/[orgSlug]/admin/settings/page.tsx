import { Stack, Text, Title, Breadcrumbs, Divider, Anchor } from '@mantine/core'
import Link from 'next/link'
import { RequireOrgAdmin } from '@/components/require-org-admin'
import { OrganizationSettingsManager } from './organization-settings-manager'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    const items = [
        <Anchor component={Link} href={`/organization/${orgSlug}/admin`} key="1">
            Dashboard
        </Anchor>,
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

            <OrganizationSettingsManager orgSlug={orgSlug} />
        </Stack>
    )
}
