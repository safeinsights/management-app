import { forwardRef, type ReactNode, type Ref } from 'react'
import { AppShellSection, Collapse, NavLink } from '@mantine/core'
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr'
import { RefWrapper } from './nav-ref-wrapper'
import styles from './navbar-items.module.css'

// Presentational profile menu pinned to the bottom of the sidebar. It owns the collapsible
// menu chrome and the trigger row (avatar + name + caret) — but NOT Clerk, the session, the
// role gating, or the disclosure logic. The role-gated items (Profile / Settings / Reviewer
// Key / SI Admin / Sign Out) are injected via the `menuItems` slot, and `userName`/`avatar`
// are supplied by the container. Kept session-free so it renders in isolation (e.g. Ladle).
// The NavbarProfileMenu container (./navbar-profile-menu) wires up the real hooks.
export type NavbarProfileMenuViewProps = {
    opened: boolean
    onToggle: () => void
    userName: ReactNode
    avatar: ReactNode
    /** Role-gated menu rows (NavLink items), built by the container. */
    menuItems: ReactNode
}

// forwardRef so the container can attach its click-outside ref to the menu section.
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
