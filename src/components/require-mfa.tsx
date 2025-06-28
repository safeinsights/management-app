'use client'

import { useLayoutEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

export const RequireMFA = () => {
    const { user } = useUser()
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()

    useLayoutEffect(() => {
        if (user?.twoFactorEnabled === false && !pathname.startsWith('/account/mfa')) {
            const inviteId = searchParams.get('inviteId')
            const redirectUrl = inviteId ? `/account/mfa?inviteId=${inviteId}` : '/account/mfa'
            router.push(redirectUrl)
        }
    }, [pathname, router, user?.twoFactorEnabled, searchParams])

    return null
}
