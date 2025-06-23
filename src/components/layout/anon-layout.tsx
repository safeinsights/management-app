'use client'

import { AnonLayoutShell } from './anon-layout-shell'

type Props = {
    children: React.ReactNode
}

export function AnonLayout({ children }: Props) {
    return <AnonLayoutShell>{children}</AnonLayoutShell>
}
