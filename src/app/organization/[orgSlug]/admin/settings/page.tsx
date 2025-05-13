import { Paper, Stack, Text, Title } from '@mantine/core'
import { RequireOrgAdmin } from '@/components/require-org-admin'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    return (
        <Stack p="md">
            <RequireOrgAdmin />
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
