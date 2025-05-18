'use client'

import { useLayoutEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getReviewerPublicKeyAction } from '@/server/actions/org.actions'
import { LoadingOverlay } from '@mantine/core'
import { useAuthInfo } from './auth'

export const RequireReviewerKeys = () => {
    const auth = useAuthInfo()
    const pathname = usePathname()
    const router = useRouter()
    const [hasKey, setHasKey] = useState<boolean | null>(null)

    useLayoutEffect(() => {
        if (!auth.isLoaded || pathname.startsWith('/account')) return

        getReviewerPublicKeyAction().then((key) => {
            setHasKey(Boolean(key))
            if (!key) {
                router.push('/account/keys')
            }
        })
    }, [auth, router, pathname])

    if (!auth.isLoaded || !hasKey) {
        return <LoadingOverlay visible />
    }
}
