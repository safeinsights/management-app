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
    const firstMenuItemRef = useRef<HTMLDivElement>(null)

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
                <RefWrapper ref={firstMenuItemRef}>
                    <NavLink
                        label="My Account"
                        leftSection={<UserIcon aria-hidden="true" />}
                        c="white"
                        className={styles.navLinkProfileHover}
                        onClick={closeAndCall(() => openUserProfile())}
                        aria-label="My Account"
                    />
                </RefWrapper>

                <Protect role={AuthRole.Reviewer}>
                    <RefWrapper>
                        <NavLink
                            label="Reviewer Key"
                            leftSection={<LockIcon aria-hidden="true" />}
                            onClick={() => router.push('/account/manage-key')}
                            c="white"
                            className={styles.navLinkProfileHover}
                            aria-label="Reviewer Key"
                        />
                    </RefWrapper>
                </Protect>

                <RefWrapper>
                    <NavLink
                        label="Sign Out"
                        leftSection={<SignOutIcon aria-hidden="true" />}
                        onClick={closeAndCall(() => signOut())}
                        c="white"
                        className={styles.navLinkProfileHover}
                        aria-label="Sign Out"
                    />
                </RefWrapper>
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
