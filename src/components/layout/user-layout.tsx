'use server'

import { AppShell } from './app-shell'
import { LoadingOverlay } from '@mantine/core'
import { ReactNode } from 'react'

type Props = {
    children: ReactNode
    showOverlay?: boolean
}

export async function UserLayout({ children, showOverlay = false }: Props) {
    return <AppShell>{showOverlay ? <LoadingOverlay visible /> : children}</AppShell>
}
