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
import styles from './side-nav.module.css'

const ICON_SIZE = 16
const EXTERNAL_ICON_SIZE = 12

const ICONS: Record<NavIcon, ReactNode> = {
    house: <HouseIcon size={ICON_SIZE} aria-hidden />,
    dashboard: <SquaresFourIcon size={ICON_SIZE} aria-hidden />,
    settings: <GearSixIcon size={ICON_SIZE} aria-hidden />,
    team: <UsersThreeIcon size={ICON_SIZE} aria-hidden />,
    legal: <FileTextIcon size={ICON_SIZE} aria-hidden />,
    catalog: <DatabaseIcon size={ICON_SIZE} aria-hidden />,
    resources: <BookOpenIcon size={ICON_SIZE} aria-hidden />,
    support: <QuestionIcon size={ICON_SIZE} aria-hidden />,
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
}

const isNavIcon = (icon: NavIcon | ReactNode): icon is NavIcon => typeof icon === 'string' && icon in ICONS

const ExternalMarker: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return (
        <span className={styles.externalIcon}>
            <ArrowSquareOutIcon size={EXTERNAL_ICON_SIZE} aria-hidden />
            <VisuallyHidden>(opens in a new tab)</VisuallyHidden>
        </span>
    )
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
}) => {
    const isExternal = url.startsWith('http')
    const className = clsx(styles.row, isSubnav && styles.subnav, isGroup && styles.groupRow)
    const content = (
        <>
            <span className={styles.icon}>{isNavIcon(icon) ? ICONS[icon] : icon}</span>
            <span className={styles.label} title={title}>
                {label}
            </span>
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
