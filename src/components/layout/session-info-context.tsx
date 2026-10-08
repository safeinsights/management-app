'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

const SessionInfoContext = createContext<UserInfo | null>(null)

const SessionInfoUpdatedAtContext = createContext(0)

export function SessionInfoProvider({
    userInfo,
    updatedAt,
    children,
}: {
    userInfo: UserInfo | null
    updatedAt?: number
    children: ReactNode
}) {
    const [mountedAt] = useState(() => Date.now())
    return (
        <SessionInfoUpdatedAtContext.Provider value={updatedAt ?? mountedAt}>
            <SessionInfoContext.Provider value={userInfo}>{children}</SessionInfoContext.Provider>
        </SessionInfoUpdatedAtContext.Provider>
    )
}

export const useSessionInfoUpdatedAt = () => useContext(SessionInfoUpdatedAtContext)

export const useSessionInfo = () => useContext(SessionInfoContext)
