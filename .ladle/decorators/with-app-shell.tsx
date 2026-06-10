import type { ReactNode } from 'react'
import { AppShellHeader, AppShellMain, Burger, Group, AppShell as MantineAppShell } from '@mantine/core'
import { APP_MAIN_BG } from '@/lib/constants'
import { SafeInsightsLogo } from '@/components/layout/svg/si-logo'
import { BrowserFrame } from './browser-frame'

// Ladle decorator that reproduces the app's real <AppShell> chrome so AppShell* sections
// (AppShellNavbar / AppShellSection / AppShellFooter / AppShellHeader) consume the same
// `--app-shell-*` CSS vars and positioning they do in production. Keep this config in sync
// with src/components/layout/app-shell.tsx (navbar width 260, breakpoint 'sm', header 60,
// footer 60, padding 'md', main bg APP_MAIN_BG centered/1600). The whole shell is wrapped in a
// BrowserFrame so its position:fixed sections stay inside a bounded "browser" instead of
// overlapping Ladle's chrome.

type WithAppShellProps = {
    children: ReactNode
    /** Placeholder content for the main pane so the navbar/footer sit beside something realistic. */
    main?: ReactNode
}

export function WithAppShell({ children, main }: WithAppShellProps) {
    return (
        <BrowserFrame>
            <MantineAppShell
                bg={APP_MAIN_BG}
                header={{ height: 60, collapsed: true }}
                footer={{ height: 60 }}
                navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: false, desktop: false } }}
                padding="md"
            >
                <AppShellHeader bg="purple.8" w="100%">
                    <Group h="100%" px="md">
                        <Burger opened={false} hiddenFrom="sm" size="sm" color="white" />
                        <SafeInsightsLogo />
                    </Group>
                </AppShellHeader>

                {children}

                <AppShellMain bg={APP_MAIN_BG} style={{ maxWidth: 1600, width: '100%', margin: '0 auto' }}>
                    {main}
                </AppShellMain>
            </MantineAppShell>
        </BrowserFrame>
    )
}
