'use client'

import type { Route } from 'next'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode } from 'react'
import { Routes } from '@/lib/routes'
import { ActivityContext } from '../activity-context'
import { FocusedLayoutShellView } from './focused-layout-shell-view'

type Props = {
    children: ReactNode
}

export function FocusedLayoutShell({ children }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const isSignInFlow = pathname.startsWith('/account/signin') || pathname.startsWith('/account/reset-password')

    return (
        <FocusedLayoutShellView
            isSignInFlow={isSignInFlow}
            onHeaderClick={() => router.push(`${Routes.accountSignin}?restart=true` as Route)}
            activityContext={<ActivityContext />}
        >
            {children}
        </FocusedLayoutShellView>
    )
}
