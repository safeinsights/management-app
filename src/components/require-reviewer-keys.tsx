'use client'

import { useLayoutEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getReviewerPublicKeyAction } from '@/server/actions/member.actions'

export const RequireReviewerKeys = () => {
    const pathname = usePathname()
    const router = useRouter()

    useLayoutEffect(() => {
        if (pathname.startsWith('/account')) {
            return
        }

        getReviewerPublicKeyAction().then((key) => {
            if (!key) {
                router.push('/account/keys')
            }
        })
    }, [pathname, router])

    return null
}
