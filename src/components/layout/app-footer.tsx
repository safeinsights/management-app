import { APP_SHELL } from '@/lib/constants'
import { semanticColor } from '@/theme/tokens'
import { AppShellFooter, Box, Text } from '@mantine/core'
import styles from './shell.module.css'

type Props = {
    // The sign-in, error and not-found shells sit on the navy page and keep the dark footer.
    isDark?: boolean
}

const copyright = () => `© ${new Date().getFullYear()} SafeInsights | Rice University`

const FocusedFooter: React.FC = () => (
    <AppShellFooter px="lg" py="md" bg={semanticColor('surface.footer')} bd="none">
        <Text ta="left" c={semanticColor('text.white')} fz="sm">
            {copyright()}
        </Text>
    </AppShellFooter>
)

// In document flow after main, never fixed, so it cannot overlay page content (Footer spec).
const InAppFooter: React.FC = () => (
    <Box component="footer" className={styles.footer} maw={APP_SHELL.mainMaxWidth}>
        <div className={styles.footerBar}>
            <Text c={semanticColor('text.secondary')} fz="sm">
                {copyright()}
            </Text>
        </div>
    </Box>
)

export function AppFooter({ isDark = false }: Props) {
    return isDark ? <FocusedFooter /> : <InAppFooter />
}
