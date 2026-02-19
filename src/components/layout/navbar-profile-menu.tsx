'use client'

import { UserAvatar } from '@/components/user-avatar'
import { UserName } from '@/components/user-name'
import { useSession } from '@/hooks/session'
import { useProfileMenuDisclosure } from '@/hooks/use-profile-menu-disclosure'
import { Routes } from '@/lib/routes'
import { AuthRole } from '@/lib/types'
import { useClerk } from '@clerk/nextjs'
import { AppShellSection, Collapse, NavLink } from '@mantine/core'
import { useClickOutside } from '@mantine/hooks'
import { CaretRightIcon, GearIcon, GlobeIcon, LockIcon, SignOutIcon, UserIcon } from '@phosphor-icons/react/dist/ssr'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { Protect } from '../auth'
import { RefWrapper } from './nav-ref-wrapper'
import styles from './navbar-items.module.css'
import { getQueryClient } from './providers'

export function NavbarProfileMenu() {
    const { signOut, openUserProfile } = useClerk()
    const router = useRouter()
    const { session } = useSession()

    const { opened, toggle, close, pathname, handleClickOutside, closeForNavigation } = useProfileMenuDisclosure()

    const menuRef = useClickOutside<HTMLDivElement>(handleClickOutside)
    const isSiAdmin = session?.user.isSiAdmin || false

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

    const handleSignOut = () => {
        getQueryClient().clear()
        signOut()
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

    return (
        <AppShellSection ref={menuRef}>
            <Collapse in={opened} bg="purple.9" id="profile-menu" role="menu">
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

                <Protect role={AuthRole.Reviewer}>
                    <NavLink
                        label="Reviewer Key"
                        leftSection={<LockIcon aria-hidden="true" />}
                        onClick={navigateTo(Routes.reviewerKey)}
                        c="white"
                        active={pathname === Routes.reviewerKey}
                        color="blue.7"
                        variant="filled"
                        className={styles.navLinkProfileHover}
                        aria-label="Reviewer Key"
                        role="menuitem"
                        component="button"
                    />
                </Protect>

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
                    onClick={closeAndCall(handleSignOut)}
                    c="white"
                    className={styles.navLinkProfileHover}
                    aria-label="Sign Out"
                    role="menuitem"
                    component="button"
                />
            </Collapse>

            <RefWrapper>
                <NavLink
                    label={
                        <>
                            Hi, <UserName />
                        </>
                    }
                    leftSection={<UserAvatar />}
                    rightSection={<CaretRightIcon aria-hidden="true" />}
                    c="white"
                    className={styles.navLinkProfileHover}
                    onClick={handleToggle}
                    aria-haspopup="true"
                    aria-expanded={opened}
                    aria-controls="profile-menu"
                    aria-label="Toggle profile menu"
                    component="button"
                />
            </RefWrapper>
        </AppShellSection>
    )
}
