'use client'

import { createContext, useContext, useState, ReactNode, FC } from 'react'

interface SpyModeContextValue {
    isSpyMode: boolean
    toggleSpyMode: () => void
}

const SpyModeContext = createContext<SpyModeContextValue | null>(null)

export const SpyModeProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [isSpyMode, setIsSpyMode] = useState(false)

    const toggleSpyMode = () => {
        setIsSpyMode((prev) => {
            const newValue = !prev
            if (newValue) {
                document.body.classList.add('spy-mode')
            } else {
                document.body.classList.remove('spy-mode')
            }
            return newValue
        })
    }

    return <SpyModeContext.Provider value={{ isSpyMode, toggleSpyMode }}>{children}</SpyModeContext.Provider>
}

export const useSpyMode = () => {
    const context = useContext(SpyModeContext)
    if (!context) {
        throw new Error('useSpyMode must be used within a SpyModeProvider')
    }
    return context
}
