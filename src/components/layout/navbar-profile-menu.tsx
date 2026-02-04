'use client'

import { UserAvatar } from '@/components/user-avatar'
import { UserName } from '@/components/user-name'
import { useSession } from '@/hooks/session'
import { Routes } from '@/lib/routes'
import { AuthRole } from '@/lib/types'
import { useClerk } from '@clerk/nextjs'
import { AppShellSection, Collapse, NavLink } from '@mantine/core'
import { useClickOutside, useDisclosure } from '@mantine/hooks'
import { CaretRightIcon, GearIcon, GlobeIcon, LockIcon, SignOutIcon, UserIcon } from '@phosphor-icons/react/dist/ssr'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect } from 'react'
import { Protect } from '../auth'
import { RefWrapper } from './nav-ref-wrapper'
import styles from './navbar-items.module.css'

export function NavbarProfileMenu() {
    const { signOut, openUserProfile } = useClerk()
    const router = useRouter()
    const pathname = usePathname()
    const { session } = useSession()
    const isOnProfilePage = pathname === Routes.researcherProfile
    const [opened, { toggle, close, open }] = useDisclosure(isOnProfilePage)

    useEffect(() => {
        if (isOnProfilePage) {
            open()
        }
    }, [isOnProfilePage, open])

    const menuRef = useClickOutside<HTMLDivElement>(() => {
        if (opened && !isOnProfilePage) {
            close()
        }
    })
    const isSiAdmin = session?.user.isSiAdmin || false

    const closeAndCall = (fn: () => void) => (e: React.MouseEvent) => {
        e.stopPropagation()
        fn()
        close()
    }

    const handleProfileClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            router.push(Routes.researcherProfile)
        },
        [router],
    )

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
                        active={isOnProfilePage}
                        color="blue.7"
                        variant="filled"
                        className={styles.navLinkProfileHover}
                        onClick={handleProfileClick}
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
                    onClick={closeAndCall(() => openUserProfile())}
                    aria-label="Settings"
                    role="menuitem"
                    component="button"
                />

                <Protect role={AuthRole.Reviewer}>
                    <NavLink
                        label="Reviewer Key"
                        leftSection={<LockIcon aria-hidden="true" />}
                        onClick={closeAndCall(() => router.push(Routes.reviewerKey))}
                        c="white"
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
                        onClick={closeAndCall(() => router.push(Routes.adminSafeinsights))}
                        c="white"
                        className={styles.navLinkProfileHover}
                        aria-label="SI Admin"
                        role="menuitem"
                        component="button"
                    />
                )}

                <NavLink
                    label="Sign Out"
                    leftSection={<SignOutIcon aria-hidden="true" />}
                    onClick={closeAndCall(() => signOut())}
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
