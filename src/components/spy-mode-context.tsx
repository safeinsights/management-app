'use client'

import { createContext, useContext, useEffect, useMemo, useState, ReactNode, FC } from 'react'
import { SPY_MODE_COOKIE_NAME } from '@/lib/constants'

interface SpyModeContextValue {
    isSpyMode: boolean
    toggleSpyMode: () => void
}

const SpyModeContext = createContext<SpyModeContextValue | null>(null)

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null

    // Keep this intentionally simple to avoid regex escaping issues.
    // document.cookie is a single string like: "a=1; b=2; c=hello%20world"
    const prefix = `${name}=`
    for (const part of document.cookie.split(';')) {
        const trimmed = part.trim()
        if (trimmed.startsWith(prefix)) {
            return decodeURIComponent(trimmed.slice(prefix.length))
        }
    }
    return null
}

function setCookie(name: string, value: string) {
    // keep this lightweight; no server security requirements since it's a UI-only opt-in gate
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
}

export const SpyModeProvider: FC<{ children: ReactNode }> = ({ children }) => {
    // Initialize from cookie on first client render (avoids setState inside an effect).
    const [isSpyMode, setIsSpyMode] = useState(() => getCookie(SPY_MODE_COOKIE_NAME) === '1')

    // Sync external DOM state (body class) to React state.
    useEffect(() => {
        document.body.classList.toggle('spy-mode', isSpyMode)
    }, [isSpyMode])

    const toggleSpyMode = () => {
        setIsSpyMode((prev) => {
            const newValue = !prev
            setCookie(SPY_MODE_COOKIE_NAME, newValue ? '1' : '0')
            return newValue
        })
    }

    const value = useMemo(() => ({ isSpyMode, toggleSpyMode }), [isSpyMode])
    return <SpyModeContext.Provider value={value}>{children}</SpyModeContext.Provider>
}

export const useSpyMode = () => {
    const context = useContext(SpyModeContext)
    if (!context) {
        throw new Error('useSpyMode must be used within a SpyModeProvider')
    }
    return context
}
