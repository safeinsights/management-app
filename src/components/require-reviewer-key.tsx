'use client'

import { isEnclaveOrg } from '@/lib/types'
import { actionResult } from '@/lib/utils'
import { reviewerKeyExistsAction } from '@/server/actions/user-keys.actions'
import { useRouter } from 'next/navigation'
import { useLayoutEffect } from 'react'
import { useSession } from '../hooks/session'
import { Routes } from '@/lib/routes'

export const RequireReviewerKey = () => {
    const { session } = useSession()
    const router = useRouter()

    useLayoutEffect(() => {
        const checkForReviewerKey = async () => {
            const enclaveOrgs = Object.values(session?.orgs || {}).some(isEnclaveOrg)
            if (!session || !enclaveOrgs) return

            const hasKey = actionResult(await reviewerKeyExistsAction())

            if (!hasKey) {
                router.push(Routes.accountKeys)
            }
        }
        checkForReviewerKey()
    }, [session, router])

    return null
}
