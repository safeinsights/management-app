import type { ReactNode } from 'react'
import { Box } from '@mantine/core'
import { APP_MAIN_BG } from '@/lib/constants'

// Lightweight Ladle decorator: the app's page background (APP_MAIN_BG) with padding, for
// non-shell stories that want the real canvas color behind them without the full AppShell.
// Uses the same shared constant as src/components/layout/app-shell.tsx so it tracks reality.
export function GreyCanvas({ children }: { children: ReactNode }) {
    return (
        <Box bg={APP_MAIN_BG} p={24} mih="100vh">
            {children}
        </Box>
    )
}
