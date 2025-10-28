'use client'

import { useLayoutEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Routes } from '@/lib/routes'

export const RequireUser = () => {
    const { isSignedIn } = useUser()
    const pathname = usePathname()
    const router = useRouter()

    useLayoutEffect(() => {
        if (pathname.startsWith('/account')) {
            return
        }
        if (isSignedIn === false) {
            router.push(Routes.accountSignin)
        }
    }, [pathname, router, isSignedIn])

    return null
}
