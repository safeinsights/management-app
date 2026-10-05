import type { ReactNode } from 'react'
import { AppShellHeader, AppShellMain, AppShell as MantineAppShell } from '@mantine/core'
import { APP_MAIN_BG, APP_SHELL } from '@/lib/constants'
import shellStyles from '@/components/layout/shell.module.css'
import { BrowserFrame } from './browser-frame'

// Ladle decorator that reproduces the app's real <AppShell> chrome so AppShell* sections
// (AppShellNavbar / AppShellSection / AppShellHeader) consume the same `--app-shell-*` CSS vars
// and positioning they do in production, and the in-flow footer follows main as it does there. The
// dimensions come from the shared APP_SHELL constant (the same one
// src/components/layout/app-shell.tsx uses), so this can't drift from the real shell. The whole
// shell is wrapped in a BrowserFrame so its position:fixed sections stay inside a bounded "browser"
// instead of overlapping Ladle's chrome.

type WithAppShellProps = {
    children?: ReactNode
    /** Placeholder content for the main pane so the navbar/footer sit beside something realistic. */
    main?: ReactNode
    /** Replaces the bar's contents; the default is an empty bar of the production height. */
    header?: ReactNode
    /** Rendered after main, where the real shell places the footer. */
    footer?: ReactNode
}

export function WithAppShell({ children, main, header, footer }: WithAppShellProps) {
    return (
        <BrowserFrame>
            <MantineAppShell
                className={shellStyles.shell}
                bg={APP_MAIN_BG}
                layout={APP_SHELL.layout}
                header={{ height: APP_SHELL.headerHeight }}
                navbar={{
                    width: APP_SHELL.navbarWidth,
                    breakpoint: APP_SHELL.navbarBreakpoint,
                    collapsed: { mobile: false, desktop: false },
                }}
                padding={APP_SHELL.padding}
            >
                <AppShellHeader withBorder={false}>{header}</AppShellHeader>

                {children}

                <AppShellMain
                    className={shellStyles.main}
                    bg={APP_MAIN_BG}
                    style={{ maxWidth: APP_SHELL.mainMaxWidth, width: '100%', margin: '0 auto' }}
                >
                    {main}
                </AppShellMain>

                {footer}
            </MantineAppShell>
        </BrowserFrame>
    )
}
