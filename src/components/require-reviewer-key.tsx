'use client'

import { isEnclaveOrg } from '@/lib/types'
import { reviewerKeyExistsAction } from '@/server/actions/user-keys.actions'
import { useRouter } from 'next/navigation'
import { useLayoutEffect } from 'react'
import { useSession } from '../hooks/session'

export const RequireReviewerKey = () => {
    const { session } = useSession()
    const router = useRouter()

    useLayoutEffect(() => {
        const checkForReviewerKey = async () => {
            const enclaveOrgs = Object.values(session?.orgs || {}).some(isEnclaveOrg)
            if (!session || !enclaveOrgs) return

            const result = await reviewerKeyExistsAction()
            // result is either boolean or ActionError
            // converts both false and action error to false for boolean check
            const hasKey = Boolean(result)

            if (!hasKey) {
                router.push('/account/keys')
            }
        }
        checkForReviewerKey()
    }, [session, router])

    return null
}
