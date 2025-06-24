'use server'

import { AnonLayoutShell } from './anon-layout-shell'

type Props = {
    children: React.ReactNode
}

export async function AnonLayout({ children }: Props) {
    return <AnonLayoutShell>{children}</AnonLayoutShell>
}
