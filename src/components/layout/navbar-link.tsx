import { FC } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import styles from './navbar-items.module.css'
import { RefWrapper } from './nav-ref-wrapper'
import { NavLink, NavLinkProps } from '@mantine/core'

type NavbarLinkProps = NavLinkProps & {
    isVisible: boolean
    url: string
    label: string
    icon: React.ReactNode
    rightIcon?: React.ReactNode
    newTab?: boolean
}

export const NavbarLink: FC<NavbarLinkProps> = ({ isVisible, url, label, icon, rightIcon, newTab, ...linkProps }) => {
    const pathname = usePathname()

    if (!isVisible) return null
    const isExternal = url.startsWith('http')

    return (
        <RefWrapper>
            <NavLink
                label={label}
                leftSection={icon}
                rightSection={rightIcon}
                component={isExternal ? undefined : Link}
                href={url as Route}
                active={pathname === url}
                c="white"
                color="blue.7"
                variant="filled"
                target={newTab ? '_blank' : '_self'}
                className={styles.navLinkHover}
                {...linkProps}
            />
        </RefWrapper>
    )
}
