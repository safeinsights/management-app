'use client'

import { useRouter } from 'next/navigation'
import { useLayoutEffect } from 'react'
import { useSession } from '../hooks/session'
import { navigateToDashboard } from '../lib/session'

export const RequireOrgAdmin = () => {
    const { session } = useSession()
    const router = useRouter()

    useLayoutEffect(() => {
        if (!session || session.org.isAdmin) return

        navigateToDashboard(router, session)
    }, [session, router])

    return null
}
