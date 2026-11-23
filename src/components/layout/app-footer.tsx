'use client'

import { APP_SHELL } from '@/lib/constants'
import { semanticColor } from '@/theme/tokens'
import { AppShellFooter, Box, Text } from '@mantine/core'
import { useIsHydrated } from '@/hooks/use-is-hydrated'
import styles from './shell.module.css'

type Props = {
    // The sign-in, error and not-found shells sit on the navy page and keep the dark footer.
    isDark?: boolean
}

type FooterProps = { year: number | null }

const currentYear = () => new Date().getFullYear()

// The year waits for the browser: on New Year's Eve the server's UTC year is already the next one.
const copyright = (year: number | null) =>
    year ? `© ${year} SafeInsights | Rice University` : '© SafeInsights | Rice University'

const FocusedFooter: React.FC<FooterProps> = ({ year }) => (
    <AppShellFooter px="lg" py="md" bg={semanticColor('surface.footer')} bd="none">
        <Text ta="left" c={semanticColor('text.white')} fz="sm">
            {copyright(year)}
        </Text>
    </AppShellFooter>
)

// In document flow after main, never fixed, so it cannot overlay page content (Footer spec).
const InAppFooter: React.FC<FooterProps> = ({ year }) => (
    <Box component="footer" className={styles.footer} maw={APP_SHELL.mainMaxWidth}>
        <div className={styles.footerBar}>
            <Text c={semanticColor('text.secondary')} fz="sm">
                {copyright(year)}
            </Text>
        </div>
    </Box>
)

export function AppFooter({ isDark = false }: Props) {
    const year = useIsHydrated() ? currentYear() : null
    return isDark ? <FocusedFooter year={year} /> : <InAppFooter year={year} />
}
