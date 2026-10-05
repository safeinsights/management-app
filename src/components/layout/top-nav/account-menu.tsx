'use client'

import { useSession } from '@/hooks/session'
import { useSignOut } from '@/hooks/use-sign-out'
import { Routes } from '@/lib/routes'
import { getLabOrg } from '@/lib/types'
import { useClerk, useUser } from '@clerk/nextjs'
import { useDisclosure, useWindowEvent } from '@mantine/hooks'
import {
    BooksIcon,
    FileTextIcon,
    GearSixIcon,
    LockIcon,
    SignOutIcon,
    SlidersIcon,
    UserIcon,
} from '@phosphor-icons/react/dist/ssr'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'
import { navIcon } from '../nav-icon'
import { AccountMenuView, type AccountMenuItem } from './account-menu-view'

// TopNav spec: initials come from the first- and last-name fields, and a multi-word surname gives its
// first letter ("Van Dyke" -> V), which a split on the full name would get wrong.
const accountInitials = (firstName?: string | null, lastName?: string | null) =>
    [firstName, lastName]
        .map((name) => name?.trim().charAt(0) ?? '')
        .join('')
        .toUpperCase()

type MenuLinks = {
    isResearcher: boolean
    isSiAdmin: boolean
    pathname: string
    onNavigate: () => void
    onOpenSettings: () => void
    onSignOut: () => void
}

// The account cluster is person-scoped: the same entries wherever the user is, with the researcher
// profile only for lab members and the SI admin console only for SI admins.
const buildSections = ({
    isResearcher,
    isSiAdmin,
    pathname,
    onNavigate,
    onOpenSettings,
    onSignOut,
}: MenuLinks): AccountMenuItem[][] => {
    const link = (label: string, icon: React.ReactNode, href: string): AccountMenuItem => ({
        label,
        icon,
        href,
        onSelect: onNavigate,
        isCurrent: pathname === href,
    })

    const account: AccountMenuItem[] = [
        ...(isResearcher ? [link('Professional profile', navIcon(UserIcon), Routes.researcherProfile)] : []),
        { label: 'Settings', icon: navIcon(GearSixIcon), onSelect: onOpenSettings },
        link('Security key', navIcon(LockIcon), Routes.userKey),
        link('Legal', navIcon(FileTextIcon), Routes.legal),
    ]

    const siAdmin: AccountMenuItem[] = isSiAdmin
        ? [
              link('Orgs & Context', navIcon(SlidersIcon), Routes.adminSafeinsights),
              link('SafeInsights legal', navIcon(BooksIcon), Routes.adminSafeinsightsLegal),
          ]
        : []

    const signOut: AccountMenuItem[] = [{ label: 'Log out', icon: navIcon(SignOutIcon), onSelect: onSignOut }]

    return [account, siAdmin, signOut].filter((section) => section.length > 0)
}

export const AccountMenu: React.FC = () => {
    const { user } = useUser()
    const { session } = useSession()
    const { openUserProfile } = useClerk()
    const signOut = useSignOut()
    const pathname = usePathname()
    const triggerRef = useRef<HTMLButtonElement>(null)
    const [opened, { toggle, close }] = useDisclosure(false)

    // The trigger is pinned to the viewport top, so page scroll and resize both dismiss the menu.
    useWindowEvent('scroll', close)
    useWindowEvent('resize', close)

    const openSettings = () => {
        close()
        openUserProfile()
    }

    const sections = buildSections({
        isResearcher: Boolean(session && getLabOrg(session)),
        isSiAdmin: Boolean(session?.user.isSiAdmin),
        pathname,
        onNavigate: close,
        onOpenSettings: openSettings,
        onSignOut: signOut,
    })

    return (
        <AccountMenuView
            opened={opened}
            onToggle={toggle}
            onClose={close}
            triggerRef={triggerRef}
            firstName={user?.firstName ?? ''}
            initials={accountInitials(user?.firstName, user?.lastName)}
            sections={sections}
        />
    )
}
