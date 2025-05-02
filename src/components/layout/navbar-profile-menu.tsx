'use client'

import { AppShellSection, NavLink } from '@mantine/core'
import { UserAvatar } from '@/components/user-avatar'
import { UserName } from '@/components/user-name'
import { CaretRight, Lock, SignOut, User } from '@phosphor-icons/react/dist/ssr'
import styles from './navbar-items.module.css'
import { CollapseContainer } from './items-collapse'
import { useDisclosure } from '@mantine/hooks'
import { useClerk } from '@clerk/nextjs'

export function NavbarProfileMenu() {
    const { signOut, openUserProfile } = useClerk()
    const [opened, { toggle }] = useDisclosure()

    return (
        <AppShellSection>
            <CollapseContainer opened={opened}>
                <NavLink
                    label="My Account"
                    leftSection={<User />}
                    c="white"
                    className={styles.navLinkProfileHover}
                    onClick={() => {
                        openUserProfile()
                    }}
                />
                <NavLink
                    label="Reviewer Key"
                    leftSection={<Lock />}
                    onClick={() => {
                        window.alert('404. Design under construction')
                    }}
                    c="white"
                    className={styles.navLinkProfileHover}
                />
                <NavLink
                    label="Sign Out"
                    leftSection={<SignOut />}
                    onClick={() => {
                        signOut()
                    }}
                    c="white"
                    className={styles.navLinkProfileHover}
                />
            </CollapseContainer>
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
                onClick={toggle}
            />
        </AppShellSection>
    )
}
