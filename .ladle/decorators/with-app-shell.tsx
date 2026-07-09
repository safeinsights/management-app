import type { ReactNode } from 'react'
import { AppShellHeader, AppShellMain, Burger, Group, AppShell as MantineAppShell } from '@mantine/core'
import { APP_MAIN_BG, APP_SHELL } from '@/lib/constants'
import { SafeInsightsLogo } from '@/components/layout/svg/si-logo'
import { BrowserFrame } from './browser-frame'

// Ladle decorator that reproduces the app's real <AppShell> chrome so AppShell* sections
// (AppShellNavbar / AppShellSection / AppShellFooter / AppShellHeader) consume the same
// `--app-shell-*` CSS vars and positioning they do in production. The dimensions/colors come
// from the shared APP_SHELL constant (the same one src/components/layout/app-shell.tsx uses),
// so this can't drift from the real shell. The whole shell is wrapped in a BrowserFrame so its
// position:fixed sections stay inside a bounded "browser" instead of overlapping Ladle's chrome.

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
                header={{ height: APP_SHELL.headerHeight, collapsed: true }}
                footer={{ height: APP_SHELL.footerHeight }}
                navbar={{
                    width: APP_SHELL.navbarWidth,
                    breakpoint: APP_SHELL.navbarBreakpoint,
                    collapsed: { mobile: false, desktop: false },
                }}
                padding={APP_SHELL.padding}
            >
                <AppShellHeader bg={APP_SHELL.headerBg} w="100%">
                    <Group h="100%" px="md">
                        <Burger opened={false} hiddenFrom="sm" size="sm" color="white" />
                        <SafeInsightsLogo />
                    </Group>
                </AppShellHeader>

                {children}

                <AppShellMain bg={APP_MAIN_BG} style={{ maxWidth: APP_SHELL.mainMaxWidth, width: '100%', margin: '0 auto' }}>
                    {main}
                </AppShellMain>
            </MantineAppShell>
        </BrowserFrame>
    )
}
