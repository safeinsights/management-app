'use client'

import { AppShellSection, Collapse, NavLink } from '@mantine/core'
import { useDisclosure, useClickOutside, useHotkeys } from '@mantine/hooks'
import { CaretRight, SignOut, User } from '@phosphor-icons/react/dist/ssr'
import { useClerk } from '@clerk/nextjs'
import { UserAvatar } from '@/components/user-avatar'
import { UserName } from '@/components/user-name'
import { useRef } from 'react'
import styles from './navbar-items.module.css'

export function NavbarProfileMenu() {
    const { signOut, openUserProfile } = useClerk()
    const [opened, { toggle, close }] = useDisclosure()

    const toggleButtonRef = useRef<HTMLAnchorElement>(null)
    const accountMenuItemRef = useRef<HTMLAnchorElement>(null)
    // const reviewerKeyMenuItemRef = useRef<HTMLAnchorElement>(null)
    const signOutMenuItemRef = useRef<HTMLAnchorElement>(null)

    const menuRef = useClickOutside<HTMLDivElement>(() => {
        if (opened) {
            close()
        }
    })

    const activeRefs = [
        accountMenuItemRef.current,
        // reviewerKeyMenuItemRef.current,
        signOutMenuItemRef.current,
    ].filter(Boolean) as HTMLAnchorElement[]

    const focusFirstMenuItem = () => {
        if (activeRefs.length > 0) {
            activeRefs[0].focus()
        }
    }

    const focusLastMenuItem = () => {
        if (activeRefs.length > 0) {
            activeRefs[activeRefs.length - 1].focus()
        }
    }

    const focusNextMenuItem = () => {
        const currentIndex = activeRefs.findIndex((ref) => ref === document.activeElement)

        if (currentIndex >= 0 && currentIndex < activeRefs.length - 1) {
            activeRefs[currentIndex + 1].focus()
        } else {
            focusFirstMenuItem()
        }
    }

    const focusPrevMenuItem = () => {
        const currentIndex = activeRefs.findIndex((ref) => ref === document.activeElement)

        if (currentIndex > 0) {
            activeRefs[currentIndex - 1].focus()
        } else {
            focusLastMenuItem()
        }
    }

    const closeAndCall = (fn: () => void) => {
        return () => {
            fn()
            close()
        }
    }

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
            () => {
                if (!opened && document.activeElement === toggleButtonRef.current) {
                    toggle()
                    focusFirstMenuItem()
                } else if (opened) {
                    focusNextMenuItem()
                }
            },
        ],
        [
            'ArrowUp',
            () => {
                if (opened) {
                    focusPrevMenuItem()
                }
            },
        ],
        [
            'Enter',
            () => {
                if (
                    document.activeElement?.getAttribute('role') === 'menuitem' ||
                    document.activeElement?.getAttribute('role') === 'button'
                ) {
                    ;(document.activeElement as HTMLElement).click()
                    close()
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
                {/* Will restore once page is built*/}
                {/* <NavLink
                    label="Reviewer Key"
                    leftSection={<Lock aria-hidden="true" />}
                    onClick={() => {
                        window.alert('404. Design under construction')
                    }}
                    c="white"
                    className={styles.navLinkProfileHover}
                    role="menuitem"
                    aria-label="Reviewer Key" 
                    tabIndex={opened ? 0 : -1}
                    ref={reviewerKeyMenuItemRef}
                /> */}
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
