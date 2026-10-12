import { AppShell, AppShellHeader, AppShellMain, Group } from '@mantine/core'
import { MAIN_CONTENT_PROPS, SIDENAV_BG } from '@/lib/constants'
import { type ReactNode } from 'react'
import { AppFooter } from './app-footer'
import { SafeInsightsLogo } from './svg/si-logo'
import classes from './focused-layout-shell-view.module.css'

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
            {activityContext}

            <AppShellHeader bg={SIDENAV_BG} withBorder={false}>
                <Group
                    h="100%"
                    p="md"
                    className={isSignInFlow ? classes.clickable : undefined}
                    onClick={() => isSignInFlow && onHeaderClick()}
                >
                    <SafeInsightsLogo width={250} height={54} />
                </Group>
            </AppShellHeader>

            <AppShellMain {...MAIN_CONTENT_PROPS} bg={SIDENAV_BG} className={classes.centered} px="md">
                {children}
            </AppShellMain>
            <AppFooter isDark />
        </AppShell>
    )
}
