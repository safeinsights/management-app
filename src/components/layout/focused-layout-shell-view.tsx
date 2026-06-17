import { AppShell, AppShellHeader, AppShellMain, Group } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { NOTIFICATION_DISPLAY_MS } from '@/lib/constants'
import '@mantine/notifications/styles.css'
import { type ReactNode } from 'react'
import { AppFooter } from './app-footer'
import { SafeInsightsLogo } from './svg/si-logo'

// Presentational centered/focused shell (sign-in, reset-password, etc.). It owns the purple
// AppShell chrome, the clickable header logo, and the centered main pane — but NOT the
// session/path: the sign-in-flow header behavior is passed in, and the session-coupled
// ActivityContext is injected via the `activityContext` slot (omitted in isolation, e.g.
// Ladle). The FocusedLayoutShell container (./focused-layout-shell) wires up the real hooks.
export type FocusedLayoutShellViewProps = {
    children: ReactNode
    /** True on sign-in / reset-password flows: makes the header logo clickable. */
    isSignInFlow: boolean
    onHeaderClick: () => void
    /** Clerk-coupled inactivity watcher; injected by the container. */
    activityContext?: ReactNode
}

export function FocusedLayoutShellView({
    children,
    isSignInFlow,
    onHeaderClick,
    activityContext,
}: FocusedLayoutShellViewProps) {
    return (
        <AppShell header={{ height: 70 }} footer={{ height: 60 }}>
            <Notifications position="top-right" autoClose={NOTIFICATION_DISPLAY_MS} />
            {activityContext}

            <AppShellHeader bg="purple.8" withBorder={false}>
                <Group
                    h="100%"
                    p="md"
                    style={{ cursor: isSignInFlow ? 'pointer' : '' }}
                    onClick={() => isSignInFlow && onHeaderClick()}
                >
                    <SafeInsightsLogo width={250} height={54} />
                </Group>
            </AppShellHeader>

            <AppShellMain
                bg="purple.8"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                px="md"
            >
                {children}
            </AppShellMain>
            <AppFooter />
        </AppShell>
    )
}
