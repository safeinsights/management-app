'use client'

import { semanticColor } from '@/theme/tokens'
import { Burger } from '@mantine/core'
import { useWindowScroll } from '@mantine/hooks'
import { AccountMenu } from './account-menu'
import styles from './top-nav.module.css'

type Props = {
    isNavOpened: boolean
    onToggleNav: () => void
}

// The bar is sticky and casts its shadow only once content scrolls beneath it.
export const TopNav: React.FC<Props> = ({ isNavOpened, onToggleNav }) => {
    const [{ y: scrollY }] = useWindowScroll()

    return (
        <nav aria-label="Account" className={styles.bar} data-scrolled={scrollY > 0 || undefined}>
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
