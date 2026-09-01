import { forwardRef, type ReactNode, type Ref } from 'react'
import { AppShellSection, Collapse, NavLink } from '@mantine/core'
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr'
import { RefWrapper } from './nav-ref-wrapper'
import styles from './navbar-items.module.css'

// Session-free so it renders in isolation; role-gated items arrive through `menuItems`.
export type NavbarProfileMenuViewProps = {
    opened: boolean
    onToggle: () => void
    userName: ReactNode
    avatar: ReactNode
    menuItems: ReactNode
}

export const NavbarProfileMenuView = forwardRef(function NavbarProfileMenuView(
    { opened, onToggle, userName, avatar, menuItems }: NavbarProfileMenuViewProps,
    ref: Ref<HTMLDivElement>,
) {
    return (
        <AppShellSection ref={ref} className={styles.profileMenuSection}>
            <Collapse in={opened} id="profile-menu" role="menu" className={styles.profileMenuCollapse}>
                {menuItems}
            </Collapse>

            <RefWrapper>
                <NavLink
                    label={userName}
                    leftSection={avatar}
                    rightSection={<CaretRightIcon aria-hidden="true" />}
                    c="white"
                    className={styles.navLinkProfileHover}
                    onClick={onToggle}
                    aria-haspopup="true"
                    aria-expanded={opened}
                    aria-controls="profile-menu"
                    aria-label="Toggle profile menu"
                    component="button"
                />
            </RefWrapper>
        </AppShellSection>
    )
})
