import type { Story } from '@ladle/react'
import { Text } from '@mantine/core'
import { WithAppShell } from '~ladle/decorators/with-app-shell'
import { AppFooter } from './app-footer'

// The in-app footer sits in the page flow after main, so it needs the real shell around it.
const meta = { title: 'Layout / App Footer' }
export default meta

export const Default: Story = () => (
    <WithAppShell main={<Text c="dimmed">Page content sits above the footer.</Text>} footer={<AppFooter />} />
)
