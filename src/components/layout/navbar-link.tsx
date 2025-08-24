import { FC } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './navbar-items.module.css'
import { RefWrapper } from './nav-ref-wrapper'
import { NavLink, NavLinkProps } from '@mantine/core'

export const NavbarLink: FC<
    NavLinkProps & { isVisible: boolean; url: string; label: string; icon: React.ReactNode }
> = ({ isVisible, url, label, icon, ...linkProps }) => {
    const pathname = usePathname()

    if (!isVisible) return null

    return (
        <RefWrapper>
            <NavLink
                label={label}
                leftSection={icon}
                component={Link}
                href={url}
                active={pathname === url}
                aria-current={pathname === url ? 'page' : undefined}
                c="white"
                color="blue.7"
                variant="filled"
                className={styles.navLinkHover}
                {...linkProps}
            />
        </RefWrapper>
    )
}
