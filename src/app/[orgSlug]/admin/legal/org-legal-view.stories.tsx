import type { Story } from '@ladle/react'
import { Paper, Stack, Text, Title } from '@mantine/core'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { OrgLegalView } from './org-legal-view'

// The org-admin Legal center page-view — the same layout legal/page.tsx renders (title + the tab
// set). The tabs are a presentational stand-in: the real ones are query- and session-coupled, and
// what this story is for is the page shell around them.
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
