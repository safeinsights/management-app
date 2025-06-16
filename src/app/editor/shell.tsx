'use client'

import {
    AppShell,
    AppShellFooter,
    AppShellMain,
    Group,
    Text,
    useMantineTheme,
} from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { ReactNode } from 'react'
import { useEditorStore } from './state'
import { AiPanel } from './ai-panel'

type Props = {
    children: ReactNode
}


export function EditorLayoutShell({ children }: Props) {
    const theme = useMantineTheme()
    const isDrawerOpen = useEditorStore(state => state.isDrawerOpen) // Ensure the drawer state is initialized)

    return (
        <AppShell footer={{ height: 60 }} aside={{ width: 350, breakpoint: 'xs', collapsed: { desktop: !isDrawerOpen } }} padding="md">
            <Notifications position="top-right" />
            <AppShellMain bg="#F1F3F5">{children}</AppShellMain>
            <AiPanel />
            <AppShellFooter p="md" bg={theme.colors.purple[9]} bd="none">
                <Group justify="left" c="white">
                    <Text c="white">© 2025 - SafeInsights, Rice University</Text>
                </Group>
            </AppShellFooter>
        </AppShell>
    )
}
