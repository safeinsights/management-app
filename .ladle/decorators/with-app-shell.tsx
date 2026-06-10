import type { ReactNode } from 'react'
import { AppShellHeader, AppShellMain, Burger, Group, AppShell as MantineAppShell } from '@mantine/core'
import { SafeInsightsLogo } from '@/components/layout/svg/si-logo'

// Ladle decorator that reproduces the app's real <AppShell> chrome so AppShell* sections
// (AppShellNavbar / AppShellSection / AppShellFooter / AppShellHeader) consume the same
// `--app-shell-*` CSS vars and positioning they do in production. Keep this config in sync
// with src/components/layout/app-shell.tsx (navbar width 260, breakpoint 'sm', header 60,
// footer 60, padding 'md', bg grey.10, header bg purple.8, main bg grey.10 centered/1600).
// A storied <AppShellNavbar> passed as children sits at the correct width over the grey canvas.

type WithAppShellProps = {
    children: ReactNode
    /** Placeholder content for the main pane so the navbar/footer sit beside something realistic. */
    main?: ReactNode
}

export function WithAppShell({ children, main }: WithAppShellProps) {
    return (
        <MantineAppShell
            bg="grey.10"
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

            <AppShellMain bg="grey.10" style={{ maxWidth: 1600, width: '100%', margin: '0 auto' }}>
                {main}
            </AppShellMain>
        </MantineAppShell>
    )
}
