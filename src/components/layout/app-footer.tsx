import { semanticColor } from '@/theme/tokens'
import { AppShellFooter, Text } from '@mantine/core'

export function AppFooter() {
    return (
        <AppShellFooter p="md" bg="purple.9" bd="none">
            <Text ta="left" c={semanticColor('text.white')} fz="sm">
                © {new Date().getFullYear()} - SafeInsights, Rice University
            </Text>
        </AppShellFooter>
    )
}
