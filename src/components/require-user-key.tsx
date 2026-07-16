'use client'

import { actionResult } from '@/lib/utils'
import { userKeyExistsAction } from '@/server/actions/user-keys.actions'
import { useRouter } from 'next/navigation'
import { useLayoutEffect } from 'react'
import { useSession } from '../hooks/session'
import { Routes } from '@/lib/routes'

export const RequireUserKey = () => {
    const { session } = useSession()
    const router = useRouter()

    useLayoutEffect(() => {
        const checkForUserKey = async () => {
            // Every user needs a key.
            if (!session) return

            const hasKey = actionResult(await userKeyExistsAction())

            if (!hasKey) {
                router.push(Routes.accountKeys)
            }
        }
        checkForUserKey()
    }, [session, router])

    return null
}
