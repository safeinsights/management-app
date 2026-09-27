'use client'

import { UserAvatar } from '@/components/user-avatar'
import { useSession } from '@/hooks/session'
import { useSignOut } from '@/hooks/use-sign-out'
import { semanticColor } from '@/theme/tokens'
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
import { AccountMenuView, type AccountMenuItem } from './account-menu-view'

const ICON_SIZE = 16
const AVATAR_SIZE = 32

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
        ...(isResearcher
            ? [link('Professional profile', <UserIcon size={ICON_SIZE} aria-hidden />, Routes.researcherProfile)]
            : []),
        { label: 'Settings', icon: <GearSixIcon size={ICON_SIZE} aria-hidden />, onSelect: onOpenSettings },
        link('Security key', <LockIcon size={ICON_SIZE} aria-hidden />, Routes.userKey),
        link('Legal', <FileTextIcon size={ICON_SIZE} aria-hidden />, Routes.legal),
    ]

    const siAdmin: AccountMenuItem[] = isSiAdmin
        ? [
              link('Orgs & Context', <SlidersIcon size={ICON_SIZE} aria-hidden />, Routes.adminSafeinsights),
              link('SafeInsights legal', <BooksIcon size={ICON_SIZE} aria-hidden />, Routes.adminSafeinsightsLegal),
          ]
        : []

    const signOut: AccountMenuItem[] = [
        { label: 'Log out', icon: <SignOutIcon size={ICON_SIZE} aria-hidden />, onSelect: onSignOut },
    ]

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
            avatar={
                <UserAvatar
                    size={AVATAR_SIZE}
                    bg={semanticColor('surface.sidenav')}
                    color={semanticColor('text.white')}
                />
            }
            sections={sections}
        />
    )
}
