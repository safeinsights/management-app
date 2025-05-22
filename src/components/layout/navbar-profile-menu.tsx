'use client'

import { AppShellSection, Collapse, NavLink } from '@mantine/core'
import { useDisclosure, useClickOutside, useHotkeys } from '@mantine/hooks'
import { CaretRight, SignOut, User, Lock } from '@phosphor-icons/react/dist/ssr'
import { useClerk } from '@clerk/nextjs'
import { UserAvatar } from '@/components/user-avatar'
import { UserName } from '@/components/user-name'
import { useRef } from 'react'
import styles from './navbar-items.module.css'
import { Protect } from '@/components/auth'
import { useRouter } from 'next/navigation'
import { AuthRole } from '@/lib/types'

export function NavbarProfileMenu() {
    const { signOut, openUserProfile } = useClerk()
    const [opened, { toggle, close }] = useDisclosure()
    const router = useRouter()
    const toggleButtonRef = useRef<HTMLAnchorElement>(null)
    const accountMenuItemRef = useRef<HTMLAnchorElement>(null)
    const reviewerKeyMenuItemRef = useRef<HTMLAnchorElement>(null)
    const signOutMenuItemRef = useRef<HTMLAnchorElement>(null)

    const menuRef = useClickOutside<HTMLDivElement>(() => opened && close())

    // Active refs and navigation helpers
    const activeRefs = [accountMenuItemRef.current, reviewerKeyMenuItemRef.current, signOutMenuItemRef.current].filter(
        Boolean,
    ) as HTMLAnchorElement[]

    const focusItem = (index: number) => activeRefs[index]?.focus()

    const navigate = (dir: 1 | -1) => {
        const index = activeRefs.findIndex((ref) => ref === document.activeElement)
        focusItem(
            index < 0 ? (dir > 0 ? 0 : activeRefs.length - 1) : (index + dir + activeRefs.length) % activeRefs.length,
        )
    }

    // Close menu after clicking on an item
    const closeAndCall = (fn: () => void) => () => (fn(), close())

    useHotkeys([
        [
            'Escape',
            () => {
                if (opened) {
                    close()
                    toggleButtonRef.current?.focus()
                }
            },
        ],
        [
            'ArrowDown',
            (e) => {
                e.preventDefault()
                if (!opened && document.activeElement === toggleButtonRef.current) {
                    toggle()
                    setTimeout(() => focusItem(0), 50) // make sure DOM is updated
                } else if (opened) {
                    focusItem(0)
                }
            },
        ],
        [
            'ArrowUp',
            (e) => {
                e.preventDefault()
                if (opened) {
                    navigate(-1)
                }
            },
        ],
        [
            'Enter',
            (e) => {
                const active = document.activeElement
                if (active?.getAttribute('role') === 'menuitem' || active?.getAttribute('role') === 'button') {
                    e.preventDefault()
                    ;(active as HTMLElement).click()
                }
            },
        ],
    ])

    return (
        <AppShellSection ref={menuRef}>
            <Collapse in={opened} bg="purple.9">
                <NavLink
                    label="My Account"
                    leftSection={<User aria-hidden="true" />}
                    c="white"
                    className={styles.navLinkProfileHover}
                    onClick={closeAndCall(() => {
                        openUserProfile()
                    })}
                    role="menuitem"
                    aria-label="My Account"
                    tabIndex={opened ? 0 : -1}
                    ref={accountMenuItemRef}
                />

                <Protect role={AuthRole.Reviewer}>
                    <NavLink
                        label="Reviewer Key"
                        leftSection={<Lock aria-hidden="true" />}
                        onClick={() => {
                            router.push('/account/keys')
                        }}
                        c="white"
                        className={styles.navLinkProfileHover}
                        role="menuitem"
                        aria-label="Reviewer Key"
                        tabIndex={opened ? 0 : -1}
                        ref={reviewerKeyMenuItemRef}
                    />
                </Protect>

                <NavLink
                    label="Sign Out"
                    leftSection={<SignOut aria-hidden="true" />}
                    onClick={closeAndCall(() => {
                        signOut()
                    })}
                    c="white"
                    className={styles.navLinkProfileHover}
                    role="menuitem"
                    aria-label="Sign Out"
                    tabIndex={opened ? 0 : -1}
                    ref={signOutMenuItemRef}
                />
            </Collapse>

            <NavLink
                label={
                    <>
                        Hi! <UserName />
                    </>
                }
                leftSection={<UserAvatar />}
                rightSection={<CaretRight aria-hidden="true" />}
                c="white"
                className={styles.navLinkProfileHover}
                onClick={toggle}
                role="button"
                aria-haspopup="true"
                aria-expanded={opened}
                aria-label="Toggle profile menu"
                tabIndex={0}
                ref={toggleButtonRef}
            />
        </AppShellSection>
    )
}
