'use client'

import { useLayoutEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

export const RequireMFA = () => {
    const { user } = useUser()
    const pathname = usePathname()
    const router = useRouter()

    useLayoutEffect(() => {
        if (user?.twoFactorEnabled !== true && !pathname.startsWith('/account/mfa')) {
            router.push('/account/mfa')
        }
    }, [pathname, router, user?.twoFactorEnabled])

    return null
}
