'use client'

import { AppShellSection, Collapse, NavLink } from '@mantine/core'
import { useDisclosure, useClickOutside } from '@mantine/hooks'
import { CaretRightIcon, SignOutIcon, UserIcon, LockIcon } from '@phosphor-icons/react/dist/ssr'
import { useClerk } from '@clerk/nextjs'
import { UserAvatar } from '@/components/user-avatar'
import { UserName } from '@/components/user-name'
import styles from './navbar-items.module.css'
import { AuthRole } from '@/lib/types'
import { useRouter } from 'next/navigation'
import { RefWrapper } from './nav-ref-wrapper'
import { useRef, useCallback } from 'react'
import { Protect } from '../auth'

export function NavbarProfileMenu() {
    const { signOut, openUserProfile } = useClerk()
    const [opened, { toggle, close }] = useDisclosure()
    const router = useRouter()
    const menuRef = useClickOutside<HTMLDivElement>(() => opened && close())
    const firstMenuItemRef = useRef<HTMLAnchorElement>(null)

    const closeAndCall = (fn: () => void) => () => {
        fn()
        close()
    }

    const handleToggle = useCallback(() => {
        const wasOpened = opened
        toggle()

        if (!wasOpened) {
            // focus the first menu item
            setTimeout(() => {
                firstMenuItemRef.current?.focus()
            }, 0)
        }
    }, [opened, toggle])

    return (
        <AppShellSection ref={menuRef}>
            <Collapse in={opened} bg="purple.9">
                <NavLink
                    ref={firstMenuItemRef}
                    label="My Account"
                    leftSection={<UserIcon aria-hidden="true" />}
                    c="white"
                    className={styles.navLinkProfileHover}
                    onClick={(e) => {
                        e.stopPropagation()
                        closeAndCall(() => openUserProfile())()
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            closeAndCall(() => openUserProfile())()
                        }
                    }}
                    aria-label="My Account"
                    tabIndex={0}
                />

                <Protect role={AuthRole.Reviewer}>
                    <NavLink
                        label="Reviewer Key"
                        leftSection={<LockIcon aria-hidden="true" />}
                        onClick={(e) => {
                            e.stopPropagation()
                            closeAndCall(() => router.push('/reviewer/keys'))()
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                closeAndCall(() => router.push('/reviewer/keys'))()
                            }
                        }}
                        c="white"
                        className={styles.navLinkProfileHover}
                        aria-label="Reviewer Key"
                        tabIndex={0}
                    />
                </Protect>

                <NavLink
                    label="Sign Out"
                    leftSection={<SignOutIcon aria-hidden="true" />}
                    onClick={(e) => {
                        e.stopPropagation()
                        closeAndCall(() => signOut())()
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            closeAndCall(() => signOut())()
                        }
                    }}
                    c="white"
                    className={styles.navLinkProfileHover}
                    aria-label="Sign Out"
                    tabIndex={0}
                />
            </Collapse>

            <RefWrapper>
                <NavLink
                    label={
                        <>
                            Hi! <UserName />
                        </>
                    }
                    leftSection={<UserAvatar />}
                    rightSection={<CaretRightIcon aria-hidden="true" />}
                    c="white"
                    className={styles.navLinkProfileHover}
                    onClick={handleToggle}
                    role="button"
                    aria-haspopup="true"
                    aria-expanded={opened}
                    aria-label="Toggle profile menu"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            handleToggle()
                        }
                    }}
                />
            </RefWrapper>
        </AppShellSection>
    )
}
