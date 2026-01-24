'use client'

import { useSpyMode } from './spy-mode-context'

// https://www.youtube.com/watch?v=pXPXMxsXT28
export function PiSymbol() {
    const { isSpyMode, toggleSpyMode } = useSpyMode()

    return (
        <div className={`pi-symbol ${isSpyMode ? 'visible' : ''}`} onClick={toggleSpyMode}>
            𝜋
        </div>
    )
}
