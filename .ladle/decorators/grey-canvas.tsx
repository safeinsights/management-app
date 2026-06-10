import type { ReactNode } from 'react'

// Lightweight Ladle decorator: the app's grey page background (grey.10) with padding, for
// non-shell stories that want the real canvas color behind them without the full AppShell.
export function GreyCanvas({ children }: { children: ReactNode }) {
    return <div style={{ background: 'var(--mantine-color-grey-10)', padding: 24, minHeight: '100vh' }}>{children}</div>
}
