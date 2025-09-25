'use client'

import { useRouter, useParams } from 'next/navigation'
import { useLayoutEffect } from 'react'
import { useSession } from '../hooks/session'

export const RequireOrgAdmin = () => {
    const { session } = useSession()
    const { orgSlug } = useParams<{ orgSlug?: string }>()
    const router = useRouter()

    useLayoutEffect(() => {
        if (!session || !orgSlug || session.orgs[orgSlug]?.isAdmin) return

        router.push('/dashboard')
    }, [session, router, orgSlug])

    return null
}
