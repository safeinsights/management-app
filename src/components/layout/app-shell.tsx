'use client'

import { AppShellHeader, AppShellMain, AppShell as MantineAppShell } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { APP_MAIN_BG, APP_SHELL, MAIN_CONTENT_PROPS } from '@/lib/constants'
import { ReactNode } from 'react'
import { AppFooter } from './app-footer'
import styles from './shell.module.css'

import { RequireLegalAcknowledgement } from '../legal/modal-acknowledgement/require-acknowledgement'
import { RequireMFA } from '../require-mfa'
import { RequireUser } from '../require-user'

import { ActivityContext } from '../activity-context'
import { RequireUserKey } from '../require-user-key'
import { AppNav } from './app-nav'
import { TopNav } from './top-nav/top-nav'

type Props = { children: ReactNode }

export function AppShell({ children }: Props) {
    const [opened, { toggle }] = useDisclosure(false)

    return (
        <MantineAppShell
            className={styles.shell}
            bg={APP_MAIN_BG}
            layout={APP_SHELL.layout}
            header={{ height: APP_SHELL.headerHeight }}
            navbar={{
                width: APP_SHELL.navbarWidth,
                breakpoint: APP_SHELL.navbarBreakpoint,
                collapsed: { mobile: !opened, desktop: false },
            }}
            padding={APP_SHELL.padding}
        >
            <RequireUser />
            <RequireMFA />
            <RequireUserKey />
            <RequireLegalAcknowledgement />
            <ActivityContext />

            <AppShellHeader withBorder={false}>
                <TopNav isNavOpened={opened} onToggleNav={toggle} />
            </AppShellHeader>

            <AppNav isOpened={opened} onToggle={toggle} />

            <AppShellMain
                {...MAIN_CONTENT_PROPS}
                className={styles.main}
                bg={APP_MAIN_BG}
                style={{ maxWidth: APP_SHELL.mainMaxWidth, width: '100%', margin: '0 auto' }}
            >
                {children}
            </AppShellMain>

            <AppFooter />
        </MantineAppShell>
    )
}
