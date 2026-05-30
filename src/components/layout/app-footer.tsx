'use client'

import { AppShellFooter, Text } from '@mantine/core'

export function AppFooter() {
    return (
        <AppShellFooter p="md" bg="purple.9" bd="none">
            <Text ta="left" c="white" fz="sm">
                © {new Date().getFullYear()} SafeInsights, Rice University
            </Text>
        </AppShellFooter>
    )
}
