'use client'

import { FC } from 'react'
import { Button, Divider } from '@mantine/core'
import Link from 'next/link'
import { Gear, House, SignOut } from '@phosphor-icons/react/dist/ssr'
import { useClerk } from '@clerk/nextjs'
import { useAuthInfo } from '@/components/auth'

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
        <>
            <Button
                size="md"
                variant="transparent"
                component={Link}
                href={dashboardURL()}
                c="white"
                leftSection={<House />}
            >
                Dashboard
            </Button>

            <Button size="md" variant="transparent" onClick={() => openUserProfile()} c="white" leftSection={<Gear />}>
                Settings
            </Button>

            <Divider color="#D4D1F3" />

            <Button size="md" variant="transparent" onClick={() => signOut()} c="white" leftSection={<SignOut />}>
                Logout
            </Button>
        </>
    )
}
