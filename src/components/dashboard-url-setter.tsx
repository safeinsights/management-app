'use client'

import { useEffect } from 'react'
import { setLastDashboardUrlAction } from '@/server/actions/session.actions'
import { useUser } from '@clerk/nextjs'

export const DashboardUrlSetter: React.FC<{ url: string }> = ({ url }) => {
    const { user } = useUser()

    useEffect(() => {
        setLastDashboardUrlAction({ url }).then(() => {
            user?.reload()
        })
    }, [url, user])

    return null
}
