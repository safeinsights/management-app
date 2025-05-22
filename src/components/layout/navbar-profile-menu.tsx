'use client'

import { AppShellSection, Collapse, NavLink } from '@mantine/core'
import { useDisclosure, useClickOutside } from '@mantine/hooks'
import { CaretRight, SignOut, User } from '@phosphor-icons/react/dist/ssr'
import { useClerk } from '@clerk/nextjs'
import { UserAvatar } from '@/components/user-avatar'
import { UserName } from '@/components/user-name'
import { useRef } from 'react'
import styles from './navbar-items.module.css'
import { useKeyboardNav } from './nabar-hotkeys-hook'

export function NavbarProfileMenu() {
    const { signOut, openUserProfile } = useClerk()
    const [opened, { toggle, close }] = useDisclosure()

    const toggleButtonRef = useRef<HTMLAnchorElement>(null)
    const accountMenuItemRef = useRef<HTMLAnchorElement>(null)
    // TODO: restore once reviewkey page is built
    // const reviewerKeyMenuItemRef = useRef<HTMLAnchorElement>(null)
    const signOutMenuItemRef = useRef<HTMLAnchorElement>(null)

    const menuRef = useClickOutside<HTMLDivElement>(() => opened && close())

    const elementRefs = [
        accountMenuItemRef,
        // reviewerKeyMenuItemRef,
        signOutMenuItemRef,
    ]

    const closeAndCall = (fn: () => void) => () => {
        fn()
        close()
    }


    useKeyboardNav({
        elements: elementRefs,
        isOpen: opened,
        onClose: close,
        onToggle: toggle,
        toggleRef: toggleButtonRef,
        onEscape: close,
        direction: 'reversed',
    })

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
                {/* TODO: restore once page is built*/}
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
