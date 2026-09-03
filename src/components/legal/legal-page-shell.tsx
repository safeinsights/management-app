'use client'

import { Stack, Title } from '@mantine/core'
import type { ReactNode } from 'react'

// The tabs are injected as a slot so a story cannot drift from the real page.
export type LegalPageShellProps = {
    title: string
    tabs: ReactNode
}

export function LegalPageShell({ title, tabs }: LegalPageShellProps) {
    return (
        <Stack p="md">
            <Title order={1} mb="xl">
                {title}
            </Title>
            {tabs}
        </Stack>
    )
}
