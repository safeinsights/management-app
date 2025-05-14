import {
    Paper,
    Stack,
    Text,
    Title,
    Breadcrumbs,
    Divider,
    Anchor,
} from '@mantine/core'
import Link from 'next/link'
import { RequireOrgAdmin } from '@/components/require-org-admin'
import { OrganizationSettingsManager } from './organization-settings-manager'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage({ params }: { params: { orgSlug: string } }) {
    const { orgSlug } = params

    const org = await getOrgFromSlugAction(orgSlug)

    const initialName: string | null = org.name
    const initialDescription: string | null = org.description

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
            <Title order={1} mb={40}>
                Settings
            </Title>

            <OrganizationSettingsManager
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
