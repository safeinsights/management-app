import type { Story } from '@ladle/react'
import { Paper, Stack, Text, Title } from '@mantine/core'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { OrgLegalView } from './org-legal-view'

// The tabs are a stand-in; the real ones are query- and session-coupled, and this story is for the
// page shell around them.
const meta = { title: 'Pages / Org legal center', argTypes: pageBackgroundArgTypes }
export default meta

const TabsStandIn = () => (
    <Paper shadow="xs" p="xl">
        <Stack>
            <Title order={3}>Study Agreement</Title>
            <Text c="dimmed">Study agreement table renders here.</Text>
        </Stack>
    </Paper>
)

export const LegalCenter: Story = () => <OrgLegalView tabs={<TabsStandIn />} />
