'use client'

import { useLayoutEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Routes } from '@/lib/routes'

export const RequireMFA = () => {
    const { user } = useUser()
    const pathname = usePathname()
    const router = useRouter()

    useLayoutEffect(() => {
        if (user?.twoFactorEnabled === false && !pathname.startsWith('/account/mfa')) {
            router.push(Routes.accountMfa)
        }
    }, [pathname, router, user?.twoFactorEnabled])

    return null
}
