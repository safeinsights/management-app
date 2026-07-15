'use client'

import { UserAvatar } from '@/components/user-avatar'
import { UserName } from '@/components/user-name'
import { useSession } from '@/hooks/session'
import { useProfileMenuDisclosure } from '@/hooks/use-profile-menu-disclosure'
import { Routes } from '@/lib/routes'
import { AuthRole, sessionNeedsKey } from '@/lib/types'
import { useSignOut } from '@/hooks/use-sign-out'
import { useClerk } from '@clerk/nextjs'
import { NavLink } from '@mantine/core'
import { useClickOutside } from '@mantine/hooks'
import { GearIcon, GlobeIcon, LockIcon, SignOutIcon, UserIcon } from '@phosphor-icons/react/dist/ssr'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { Protect } from '../auth'
import { NavbarProfileMenuView } from './navbar-profile-menu-view'
import styles from './navbar-items.module.css'

export function NavbarProfileMenu() {
    const { openUserProfile } = useClerk()
    const signOut = useSignOut()
    const router = useRouter()
    const { session } = useSession()

    const { opened, toggle, close, pathname, handleClickOutside, closeForNavigation } = useProfileMenuDisclosure()

    const menuRef = useClickOutside<HTMLDivElement>(handleClickOutside)
    const isSiAdmin = session?.user.isSiAdmin || false
    const needsKey = sessionNeedsKey(session)

    const navigateTo = (route: string) => (e: React.MouseEvent) => {
        e.stopPropagation()
        router.push(route as Parameters<typeof router.push>[0])
        closeForNavigation(route)
    }

    const closeAndCall = (fn: () => void) => (e: React.MouseEvent) => {
        e.stopPropagation()
        fn()
        close()
    }

    const handleSettingsClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        openUserProfile()
        handleClickOutside()
    }

    const handleToggle = useCallback(() => {
        const wasOpened = opened
        toggle()

        if (!wasOpened) {
            // focus the first menu item
            setTimeout(() => {
                const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
                firstItem?.focus()
            }, 0)
        }
    }, [opened, toggle, menuRef])

    const menuItems = (
        <>
            <Protect role={AuthRole.Researcher}>
                <NavLink
                    label="Profile"
                    leftSection={<UserIcon aria-hidden="true" />}
                    c="white"
                    active={pathname === Routes.researcherProfile}
                    color="blue.7"
                    variant="filled"
                    className={styles.navLinkProfileHover}
                    onClick={navigateTo(Routes.researcherProfile)}
                    aria-label="Profile"
                    role="menuitem"
                    component="button"
                />
            </Protect>

            <NavLink
                label="Settings"
                leftSection={<GearIcon aria-hidden="true" />}
                c="white"
                className={styles.navLinkProfileHover}
                onClick={handleSettingsClick}
                aria-label="Settings"
                role="menuitem"
                component="button"
            />

            {needsKey && (
                <NavLink
                    label="Security key"
                    leftSection={<LockIcon aria-hidden="true" />}
                    onClick={navigateTo(Routes.userKey)}
                    c="white"
                    active={pathname === Routes.userKey}
                    color="blue.7"
                    variant="filled"
                    className={styles.navLinkProfileHover}
                    aria-label="Security key"
                    role="menuitem"
                    component="button"
                />
            )}

            {isSiAdmin && (
                <NavLink
                    label="SI Admin"
                    leftSection={<GlobeIcon aria-hidden="true" />}
                    onClick={navigateTo(Routes.adminSafeinsights)}
                    c="white"
                    active={pathname === Routes.adminSafeinsights}
                    color="blue.7"
                    variant="filled"
                    className={styles.navLinkProfileHover}
                    aria-label="SI Admin"
                    role="menuitem"
                    component="button"
                />
            )}

            <NavLink
                label="Sign Out"
                leftSection={<SignOutIcon aria-hidden="true" />}
                onClick={closeAndCall(signOut)}
                c="white"
                className={styles.navLinkProfileHover}
                aria-label="Sign Out"
                role="menuitem"
                component="button"
            />
        </>
    )

    return (
        <NavbarProfileMenuView
            ref={menuRef}
            opened={opened}
            onToggle={handleToggle}
            userName={
                <>
                    Hi, <UserName />
                </>
            }
            avatar={<UserAvatar />}
            menuItems={menuItems}
        />
    )
}
