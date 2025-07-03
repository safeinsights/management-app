'use client'

import { useEffect, useState } from 'react'

// https://www.youtube.com/watch?v=pXPXMxsXT28
export function PiSymbol() {
    const [isSpyMode, setIsSpyMode] = useState(false)

    useEffect(() => {
        const handleClick = () => {
            setIsSpyMode(!isSpyMode)

            if (!isSpyMode) {
                document.body.classList.add('spy-mode')
            } else {
                document.body.classList.remove('spy-mode')
            }
        }

        const piElement = document.querySelector('.pi-symbol')
        if (piElement) {
            piElement.addEventListener('click', handleClick)

            return () => {
                piElement.removeEventListener('click', handleClick)
            }
        }
    }, [isSpyMode])

    return <div className={`pi-symbol ${isSpyMode ? 'visible' : ''}`}>𝜋</div>
}
