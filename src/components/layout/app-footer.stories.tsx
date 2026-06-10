import type { Story } from '@ladle/react'
import { Text } from '@mantine/core'
import { WithAppShell } from '../../../.ladle/decorators/with-app-shell'
import { AppFooter } from './app-footer'

// The app footer renders an <AppShellFooter>, which only positions correctly inside a real
// <AppShell>, so it's storied within the AppShell decorator.
const meta = { title: 'Layout / App Footer' }
export default meta

export const Default: Story = () => (
    <WithAppShell main={<Text c="dimmed">Page content sits above the footer.</Text>}>
        <AppFooter />
    </WithAppShell>
)
