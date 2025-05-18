'use client'

import { useLayoutEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getReviewerPublicKeyAction } from '@/server/actions/org.actions'
import { LoadingOverlay } from '@mantine/core'

export const RequireReviewerKeys = () => {
    const pathname = usePathname()
    const router = useRouter()
    const [hasKey, setHasKey] = useState<boolean | null>(null)

    useLayoutEffect(() => {
        if (pathname.startsWith('/account')) return

        getReviewerPublicKeyAction().then((key) => {
            setHasKey(Boolean(key))
            if (!key) {
                router.push('/account/keys')
            }
        })
    }, [router, pathname])

    if (!hasKey) {
        return <LoadingOverlay visible />
    }
}
