import { semanticColor } from '@/theme/tokens'
import { AppShellFooter, Text } from '@mantine/core'

type Props = {
    // The sign-in, error and not-found shells sit on the navy page and keep the dark footer.
    isDark?: boolean
}

export function AppFooter({ isDark = false }: Props) {
    const bg = isDark ? semanticColor('surface.footer') : semanticColor('surface.page')
    const color = isDark ? semanticColor('text.white') : semanticColor('text.primary')

    return (
        <AppShellFooter px="lg" py="md" bg={bg} bd="none">
            <Text ta="left" c={color} fz="sm">
                © {new Date().getFullYear()} SafeInsights
            </Text>
        </AppShellFooter>
    )
}
