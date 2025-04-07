'use client'

import { useLayoutEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

export const RequireUser = () => {
    const { isSignedIn } = useUser()
    const pathname = usePathname()
    const router = useRouter()

    useLayoutEffect(() => {
        if (isSignedIn === false) {
            router.push('/account/signin')
        }
    }, [pathname, router, isSignedIn])

    return null
}
