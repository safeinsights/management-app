import type { Story } from '@ladle/react'
import { Text } from '@mantine/core'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { LegalPageShell } from './legal-page-shell'
import { LegalPanel } from './legal-panel'

const meta = { title: 'Pages / Legal', argTypes: pageBackgroundArgTypes }
export default meta

// A stand-in for the real tabs, which are query- and session-coupled.
const TabsStandIn = () => (
    <LegalPanel title="Study Agreement">
        <Text c="dimmed">Study agreement table renders here.</Text>
    </LegalPanel>
)

export const UserLegal: Story = () => <LegalPageShell title="Legal" tabs={<TabsStandIn />} />

export const OrgLegalCenter: Story = () => (
    <LegalPageShell eyebrow="Genius" title="Legal center" tabs={<TabsStandIn />} />
)
