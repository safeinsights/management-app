'use client'

import { FC } from 'react'
import { Button, Divider, Stack } from '@mantine/core'
import Link from 'next/link'
import { Gear, House, SignOut } from '@phosphor-icons/react/dist/ssr'
import { useClerk } from '@clerk/nextjs'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'

export const NavbarItems: FC = () => {
    const { signOut, openUserProfile } = useClerk()
    const { isMember, isResearcher, isAdmin } = useAuthInfo()

    const dashboardURL = () => {
        if (isMember) return '/member/openstax/dashboard'
        if (isResearcher) return '/researcher/dashboard'
        if (isAdmin) return '/admin/dashboard'
        return '/'
    }

    return (
        <Stack gap="xs">
            <Button
                fullWidth
                className={styles.hover}
                justify="flex-start"
                variant="transparent"
                component={Link}
                href={dashboardURL()}
                c="white"
                leftSection={<House />}
            >
                Dashboard
            </Button>

            <Button
                fullWidth
                className={styles.hover}
                justify="flex-start"
                variant="transparent"
                onClick={() => openUserProfile()}
                c="white"
                leftSection={<Gear />}
            >
                Settings
            </Button>

            <Divider color="#D4D1F3" />

            <Button
                fullWidth
                className={styles.hover}
                justify="flex-start"
                variant="transparent"
                onClick={() => signOut()}
                c="white"
                leftSection={<SignOut />}
            >
                Logout
            </Button>
        </Stack>
    )
}
