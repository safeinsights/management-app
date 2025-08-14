'use client'

import { useEffect, useRef } from 'react'
import { setLastDashboardUrlAction } from '@/server/actions/session.actions'
import { useUser } from '@clerk/nextjs'

export const DashboardUrlSetter: React.FC<{ url: string }> = ({ url }) => {
    const { user } = useUser()
    const lastSetUrl = useRef<string>('')

    useEffect(() => {
        if (url !== lastSetUrl.current && user) {
            lastSetUrl.current = url
            setLastDashboardUrlAction({ url }).then(() => {
                user.reload()
            })
        }
    }, [url, user])
    return null
}
