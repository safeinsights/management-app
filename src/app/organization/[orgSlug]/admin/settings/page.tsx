import {
    Paper,
    Stack,
    Text,
    Title,
    Breadcrumbs,
    Anchor,
    Divider,
    TextInput,
    Textarea,
    Group,
    Button,
} from '@mantine/core'
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
            <Title order={1} mb={40}>
                Settings
            </Title>

            <Paper shadow="xs" p="xl" mb="xl">
                <Title order={3} mb="lg">
                    About organization
                </Title>
                <Stack gap="md">
                    <TextInput
                        label="Name"
                        withAsterisk
                        // value="" // TODO: No logical implementation yet
                    />
                    <Textarea
                        label="Description"
                        maxLength={250}
                        description="Word limit is 250 characters"
                        // value="" // TODO: No logical implementation yet
                    />
                </Stack>
                <Group justify="flex-end" mt="xl">
                    <Button variant="outline">Cancel</Button>
                    <Button>Save</Button>
                </Group>
            </Paper>

            <Paper shadow="xs" p="xl" style={{ visibility: 'hidden' }}>
                <Title order={3} mb="lg">
                    API key
                </Title>
                <Text>Section under design</Text>
            </Paper>
        </Stack>
    )
}
