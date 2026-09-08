import type { Story } from '@ladle/react'
import { Paper, Stack, Text, Title } from '@mantine/core'
import { BrowserFrame } from '~ladle/decorators/browser-frame'
import { FocusedLayoutShellView } from './focused-layout-shell-view'

const meta = { title: 'Layout / Focused Shell' }
export default meta

const Card = () => (
    <Paper p="xxl" shadow="xs" w={420} maw="100%">
        <Stack>
            <Title order={3}>Welcome back</Title>
            <Text c="dimmed">Sign-in / focused-flow content sits centered on the purple backdrop.</Text>
        </Stack>
    </Paper>
)

export const Default: Story = () => (
    <BrowserFrame>
        <FocusedLayoutShellView isSignInFlow={false} onHeaderClick={() => {}}>
            <Card />
        </FocusedLayoutShellView>
    </BrowserFrame>
)

export const SignInFlow: Story = () => (
    <BrowserFrame>
        <FocusedLayoutShellView isSignInFlow={true} onHeaderClick={() => {}}>
            <Card />
        </FocusedLayoutShellView>
    </BrowserFrame>
)
