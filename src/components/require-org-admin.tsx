'use client'

import { useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOrgInfo } from './org-info'
import { useAuth } from '@clerk/nextjs'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'

export const RequireOrgAdmin = () => {
    const { isLoaded, org } = useOrgInfo()
    const router = useRouter()
    const { orgSlug } = useAuth()

    useLayoutEffect(() => {
        if (!isLoaded || orgSlug == CLERK_ADMIN_ORG_SLUG) return

        if (!org?.isAdmin) {
            if (org?.isResearcher) {
                router.push('/researcher/dashboard')
            } else if (org?.isReviewer) {
                router.push(`/reviewer/${org.slug}/dashboard`)
            } else {
                router.push('/')
            }
        }
    }, [org, isLoaded, router, orgSlug])

    return null
}
