import { Popover, UnstyledButton } from '@mantine/core'
import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react/dist/ssr'
import type { Route } from 'next'
import Link from 'next/link'
import type { FocusEvent, ReactNode, RefObject } from 'react'
import { navIcon } from '../nav-icon'
import styles from './top-nav.module.css'

const CARET_SIZE = 12
const MENU_OFFSET = 4
const MENU_TRANSITION_MS = 200

export type AccountMenuItem = {
    label: string
    icon: ReactNode
    href?: string
    onSelect?: () => void
    isCurrent?: boolean
}

// Session-free so it renders in isolation; the container supplies the sections and the handlers.
export type AccountMenuViewProps = {
    opened: boolean
    onToggle: () => void
    onClose: () => void
    triggerRef: RefObject<HTMLButtonElement | null>
    firstName: string
    avatar: ReactNode
    sections: AccountMenuItem[][]
}

const Caret: React.FC<{ opened: boolean }> = ({ opened }) => (
    <span className={styles.caret}>{navIcon(opened ? CaretUpIcon : CaretDownIcon, CARET_SIZE)}</span>
)

const MenuItemRow: React.FC<{ item: AccountMenuItem }> = ({ item }) => {
    const content = (
        <>
            <span className={styles.itemIcon}>{item.icon}</span>
            {item.label}
        </>
    )

    if (item.href) {
        return (
            <Link
                href={item.href as Route}
                className={styles.item}
                onClick={item.onSelect}
                aria-current={item.isCurrent ? 'page' : undefined}
            >
                {content}
            </Link>
        )
    }

    return (
        <button type="button" className={styles.item} onClick={item.onSelect}>
            {content}
        </button>
    )
}

const Divider: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <li role="separator" className={styles.divider} />
}

const MenuSection: React.FC<{ items: AccountMenuItem[]; index: number }> = ({ items, index }) => (
    <>
        <Divider isVisible={index > 0} />
        {items.map((item) => (
            <li key={item.label}>
                <MenuItemRow item={item} />
            </li>
        ))}
    </>
)

// A popover of links and buttons, deliberately not an ARIA menu: Tab walks the items and leaves.
export const AccountMenuView: React.FC<AccountMenuViewProps> = ({
    opened,
    onToggle,
    onClose,
    triggerRef,
    firstName,
    avatar,
    sections,
}) => {
    const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
        const next = event.relatedTarget
        if (next instanceof Node && (event.currentTarget.contains(next) || next === triggerRef.current)) return
        onClose()
    }

    return (
        <Popover
            opened={opened}
            onDismiss={onClose}
            position="bottom-end"
            offset={MENU_OFFSET}
            withinPortal={false}
            // The trigger never scrolls away (page scroll closes the menu), so the detached check is
            // only ever a false positive that would blank the menu with display: none.
            hideDetached={false}
            middlewares={{ flip: false, shift: false }}
            trapFocus={false}
            returnFocus
            transitionProps={{ transition: 'pop-top-right', duration: MENU_TRANSITION_MS }}
            classNames={{ dropdown: styles.dropdown }}
        >
            <Popover.Target>
                <UnstyledButton
                    ref={triggerRef}
                    className={styles.trigger}
                    onClick={onToggle}
                    aria-expanded={opened}
                    aria-haspopup="dialog"
                    aria-label="Toggle profile menu"
                >
                    {avatar}
                    <span className={styles.name}>{firstName}</span>
                    <Caret opened={opened} />
                </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown onBlur={closeWhenFocusLeaves}>
                <ul className={styles.list}>
                    {sections.map((items, index) => (
                        <MenuSection key={index} items={items} index={index} />
                    ))}
                </ul>
            </Popover.Dropdown>
        </Popover>
    )
}
