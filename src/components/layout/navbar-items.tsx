'use client'

import { FC } from 'react'
import { Button, Divider, Stack, Group } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Gear, House, SignOut } from '@phosphor-icons/react/dist/ssr'
import { useClerk, OrganizationSwitcher } from '@clerk/nextjs'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'
import clsx from 'clsx'

export const NavbarItems: FC = () => {
    const { signOut, openUserProfile } = useClerk()
    const { isMember, isResearcher, isAdmin } = useAuthInfo()
    const pathname = usePathname()

    const dashboardURL = () => {
        if (isMember) return '/member/openstax/dashboard'
        if (isResearcher) return '/researcher/dashboard'
        if (isAdmin) return '/admin/dashboard'
        return '/'
    }

    const currentDashboardUrl = dashboardURL()

    return (
        <Stack gap="xs">
            <Button
                fullWidth
                className={clsx(styles.hover, {
                    [styles.active]: pathname === currentDashboardUrl,
                })}
                justify="flex-start"
                variant="transparent"
                component={Link}
                href={currentDashboardUrl}
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
            <Group justify="left" pl="xs" c="white">
                {/* TODO Temporary for dev mode only? admins? */}
                <OrganizationSwitcher
                    afterSelectOrganizationUrl="/"
                    appearance={{
                        elements: {
                            organizationSwitcherTrigger: {
                                color: 'white !important',
                                '& span': { color: 'white !important' },
                                padding: 0,
                            },
                        },
                    }}
                />
            </Group>
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
