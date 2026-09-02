'use client'

import { Stack, Title } from '@mantine/core'
import type { ReactNode } from 'react'

// The tabs are injected as a slot so a story cannot drift from the real page.
export type UserLegalViewProps = {
    tabs: ReactNode
}

export function UserLegalView({ tabs }: UserLegalViewProps) {
    return (
        <Stack p="md">
            <Title order={1} mb="xl">
                Legal
            </Title>
            {tabs}
        </Stack>
    )
}
