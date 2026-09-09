'use client'

import { Stack } from '@mantine/core'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/page-header'

// The tabs are injected as a slot so a story cannot drift from the real page.
export type LegalPageShellProps = {
    title: string
    eyebrow?: string
    tabs: ReactNode
}

export function LegalPageShell({ title, eyebrow, tabs }: LegalPageShellProps) {
    return (
        <Stack p="md">
            <PageHeader eyebrow={eyebrow} title={title} />
            {tabs}
        </Stack>
    )
}
