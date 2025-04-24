'use client'

import { FC } from 'react'
import { Button, Divider, Stack, Group } from '@mantine/core'
import Link from 'next/link'
import { Gear, House, SignOut } from '@phosphor-icons/react/dist/ssr'
import { useClerk, OrganizationSwitcher } from '@clerk/nextjs'
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
        <Stack p="sm" gap="sm">
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
            <Divider c="purple.0" mx="auto" w="90%" mt="xs" />
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
