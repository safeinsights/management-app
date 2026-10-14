import type { NavIcon } from '@/lib/nav/side-nav'
import { VisuallyHidden } from '@mantine/core'
import {
    ArrowSquareOutIcon,
    BookOpenIcon,
    DatabaseIcon,
    FileTextIcon,
    GearSixIcon,
    HouseIcon,
    QuestionIcon,
    SquaresFourIcon,
    UsersThreeIcon,
} from '@phosphor-icons/react/dist/ssr'
import clsx from 'clsx'
import type { Route } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { navIcon } from '../nav-icon'
import styles from './side-nav.module.css'

// 12px on purpose: the external marker is attached to the label, not a peer of it (SideNav spec).
const EXTERNAL_ICON_SIZE = 12

const ICONS: Record<NavIcon, ReactNode> = {
    house: navIcon(HouseIcon),
    dashboard: navIcon(SquaresFourIcon),
    settings: navIcon(GearSixIcon),
    team: navIcon(UsersThreeIcon),
    legal: navIcon(FileTextIcon),
    catalog: navIcon(DatabaseIcon),
    resources: navIcon(BookOpenIcon),
    support: navIcon(QuestionIcon),
}

type NavRowProps = {
    label: string
    url: string
    icon: NavIcon | ReactNode
    isCurrent?: boolean
    isSubnav?: boolean
    isGroup?: boolean
    rightSection?: ReactNode
    title?: string
    hasUnread?: boolean
}

const isNavIcon = (icon: NavIcon | ReactNode): icon is NavIcon => typeof icon === 'string' && icon in ICONS

const ExternalMarker: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return (
        <span className={styles.externalIcon}>
            {navIcon(ArrowSquareOutIcon, EXTERNAL_ICON_SIZE)}
            <VisuallyHidden>(opens in a new tab)</VisuallyHidden>
        </span>
    )
}

// Sits on the icon's top-right corner, against its box rather than its glyph, so every icon gets
// the same offset (OTTER-838). The text for screen readers follows the label instead.
const UnreadBadge: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <span className={styles.unreadBadge} />
}

const UnreadText: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <VisuallyHidden>Updated</VisuallyHidden>
}

// Every nav row is an anchor, group rows included: they navigate to the org dashboard.
export const NavRow: React.FC<NavRowProps> = ({
    label,
    url,
    icon,
    isCurrent = false,
    isSubnav = false,
    isGroup = false,
    rightSection,
    title,
    hasUnread = false,
}) => {
    const isExternal = url.startsWith('http')
    const className = clsx(styles.row, isSubnav && styles.subnav, isGroup && styles.groupRow)
    const content = (
        <>
            <span className={styles.icon}>
                {isNavIcon(icon) ? ICONS[icon] : icon}
                <UnreadBadge isVisible={hasUnread} />
            </span>
            <span className={styles.label} title={title}>
                {label}
            </span>
            <UnreadText isVisible={hasUnread} />
            <ExternalMarker isVisible={isExternal} />
            {rightSection}
        </>
    )

    if (isExternal) {
        return (
            <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
                {content}
            </a>
        )
    }

    return (
        <Link href={url as Route} className={className} aria-current={isCurrent ? 'page' : undefined}>
            {content}
        </Link>
    )
}
