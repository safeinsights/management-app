'use client'

import { semanticColor } from '@/theme/tokens'
import { Burger } from '@mantine/core'
import { useWindowEvent } from '@mantine/hooks'
import { useState } from 'react'
import { AccountMenu } from './account-menu'
import styles from './top-nav.module.css'

// A boolean, not the scroll position: useState skips the render while it is unchanged, so scrolling
// re-renders the bar only when it crosses the top of the page.
const useIsScrolled = () => {
    const [isScrolled, setIsScrolled] = useState(false)
    useWindowEvent('scroll', () => setIsScrolled(window.scrollY > 0))
    return isScrolled
}

type Props = {
    isNavOpened: boolean
    onToggleNav: () => void
}

// The bar is sticky and casts its shadow only once content scrolls beneath it.
export const TopNav: React.FC<Props> = ({ isNavOpened, onToggleNav }) => {
    const isScrolled = useIsScrolled()

    return (
        <nav aria-label="Account" className={styles.bar} data-scrolled={isScrolled || undefined}>
            <Burger
                opened={isNavOpened}
                onClick={onToggleNav}
                hiddenFrom="sm"
                size="sm"
                color={semanticColor('surface.sidenav')}
                aria-label="Toggle navigation"
            />
            <div className={styles.account}>
                <AccountMenu />
            </div>
        </nav>
    )
}
