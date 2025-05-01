'use client'

import { NavLink, AppShellSection } from '@mantine/core'
import { UserAvatar } from '@/components/user-avatar'
import { UserName } from '@/components/user-name'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import { useUser } from '@clerk/nextjs'
import styles from './navbar-items.module.css'

export function NavbarProfileMenu() {
    return (
        <AppShellSection>
            {/* Placeholder for collapsable menu */}
            <NavLink
                label={
                    <>
                        Hi! <UserName />
                    </>
                }
                leftSection={<UserAvatar />}
                rightSection={<CaretRight />}
                c="white"
                className={styles.navLinkProfileHover}
            />
        </AppShellSection>
    )
}
