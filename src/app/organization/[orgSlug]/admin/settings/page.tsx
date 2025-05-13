import { Paper, Stack, Text, Title, Breadcrumbs, Anchor, Divider } from '@mantine/core'
import Link from 'next/link'
import { RequireOrgAdmin } from '@/components/require-org-admin'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    const items = [
        <Anchor component={Link} href={`/organization/${orgSlug}/admin`} key="1">
            Dashboard
        </Anchor>,
        <Text key="2">Admin</Text>,
        <Text key="3">Settings</Text>,
    ]

    return (
        <Stack p="md">
            <RequireOrgAdmin />
            <Breadcrumbs>{items}</Breadcrumbs>
            <Divider />
            <Title>Organization Settings</Title>
            <Text>
                Manage your organization's settings here. (Content to be added)
            </Text>
            <Paper shadow="xs" p="xl">
                <Text>Organization: {orgSlug}</Text>
                {/* Placeholder for future settings content */}
            </Paper>
        </Stack>
    )
}
