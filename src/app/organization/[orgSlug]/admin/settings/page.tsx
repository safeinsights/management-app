import {
    Paper,
    Stack,
    Text,
    Title,
    Breadcrumbs,
    Anchor,
    Divider
} from '@mantine/core'
import Link from 'next/link'
import { RequireOrgAdmin } from '@/components/require-org-admin'
import { AdminSettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage({ params }: { params: { orgSlug: string } }) {
    const { orgSlug } = params

    // TODO: Fetch actual initial data for name and description from the organization
    const initialName: string | null = "Current Org Name Placeholder"
    const initialDescription: string | null = "Current Org Description Placeholder"

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
            <Title order={1} mb={40}>
                Settings
            </Title>

            <AdminSettingsForm
                orgSlug={orgSlug}
                initialName={initialName}
                initialDescription={initialDescription}
            />

            <Paper shadow="xs" p="xl" style={{ visibility: 'hidden' }}>
                <Title order={3} mb="lg">
                    API key
                </Title>
                <Text>Section under design</Text>
            </Paper>
        </Stack>
    )
}
