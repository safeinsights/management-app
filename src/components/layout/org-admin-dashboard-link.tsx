'use client'

import { FC, useState, useEffect } from 'react'
import { NavLink } from '@mantine/core'
import Link from 'next/link'
import { Gear, UsersThree } from '@phosphor-icons/react/dist/ssr'
import { Protect } from '@clerk/nextjs'
import styles from './navbar-items.module.css'

interface OrgAdminDashboardLinkProps {
    orgSlug: string | null | undefined
    pathname: string
}

export const OrgAdminDashboardLink: FC<OrgAdminDashboardLinkProps> = ({ orgSlug, pathname }) => {
    const orgAdminBaseUrl = `/organization/${orgSlug}/admin`
    // avoid a "closed->open" flash on selecting submenus first time by seeding state from the current path
    const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(() =>
        Boolean(orgSlug && pathname.startsWith(orgAdminBaseUrl)),
    )

    useEffect(() => {
        if (orgSlug) {
            if (pathname.startsWith(orgAdminBaseUrl)) {
                setIsAdminMenuOpen(true)
            } else {
                setIsAdminMenuOpen(false)
            }
        } else {
            setIsAdminMenuOpen(false)
        }
    }, [pathname, orgAdminBaseUrl, orgSlug])

    if (!orgSlug) {
        return null
    }

    return (
        <Protect role="org:admin">
            <NavLink
                label="Admin"
                leftSection={<Gear />}
                onClick={() => {
                    if (!pathname.startsWith(orgAdminBaseUrl)) {
                        setIsAdminMenuOpen((prev) => !prev)
                    }
                }}
                active={false}
                opened={isAdminMenuOpen}
                c="white"
                className={styles.navLinkHover}
                rightSection={<></>}
            >
                <NavLink
                    label="Manage Team"
                    leftSection={<UsersThree size={20} />}
                    component={Link}
                    href={`${orgAdminBaseUrl}/users`}
                    active={pathname === `${orgAdminBaseUrl}/users`}
                    c="white"
                    color="blue.7"
                    variant="filled"
                    className={styles.navLinkHover}
                    pl="xl"
                />
                {/* TODO: re-add if we have a org admin settings page */}
                {/* <NavLink
                    label="Settings"
                    leftSection={<Sliders size={20} />}
                    component={Link}
                    href={`${orgAdminBaseUrl}/settings`}
                    active={pathname === `${orgAdminBaseUrl}/settings`}
                    c="white"
                    color="blue.7"
                    variant="filled"
                    className={styles.navLinkHover}
                    pl="xl"
                /> */}
            </NavLink>
        </Protect>
    )
}
