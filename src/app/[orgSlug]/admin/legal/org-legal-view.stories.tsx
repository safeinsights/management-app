import { Paper, Stack, Text, Title } from '@mantine/core'
import { OrgLegalView } from './org-legal-view'

// Presentational stand-in for the tab set, so the story needs no session or query client.
const TabsStandIn = () => (
    <Paper shadow="xs" p="xl">
        <Stack>
            <Title order={3}>Study Agreement</Title>
            <Text c="dimmed">Study agreement table renders here.</Text>
        </Stack>
    </Paper>
)

export const LegalCenter = () => <OrgLegalView tabs={<TabsStandIn />} />
