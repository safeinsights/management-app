'use client'

import { createContext, useContext, type ReactNode } from 'react'

const SessionInfoContext = createContext<UserInfo | null>(null)

export function SessionInfoProvider({ userInfo, children }: { userInfo: UserInfo | null; children: ReactNode }) {
    return <SessionInfoContext.Provider value={userInfo}>{children}</SessionInfoContext.Provider>
}

export const useSessionInfo = () => useContext(SessionInfoContext)
