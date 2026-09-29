import { AppShell, AppShellHeader, AppShellMain, Group } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { MAIN_CONTENT_PROPS, NOTIFICATION_DISPLAY_MS, SIDENAV_BG } from '@/lib/constants'
import '@mantine/notifications/styles.css'
import { type ReactNode } from 'react'
import { AppFooter } from './app-footer'
import { SafeInsightsLogo } from './svg/si-logo'

// Session-free so it renders in isolation; ./focused-layout-shell wires up the real hooks.
export type FocusedLayoutShellViewProps = {
    children: ReactNode
    isSignInFlow: boolean
    onHeaderClick: () => void
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

            <AppShellHeader bg={SIDENAV_BG} withBorder={false}>
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
                {...MAIN_CONTENT_PROPS}
                bg={SIDENAV_BG}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                px="md"
            >
                {children}
            </AppShellMain>
            <AppFooter />
        </AppShell>
    )
}
