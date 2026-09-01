'use client'

import { Stack, Title } from '@mantine/core'
import type { ReactNode } from 'react'

// The tabs are injected as a slot so a story cannot drift from the real page.
export type OrgLegalViewProps = {
    tabs: ReactNode
}

export function OrgLegalView({ tabs }: OrgLegalViewProps) {
    return (
        <Stack p="md">
            <Title order={1} mb="xl">
                Legal center
            </Title>
            {tabs}
        </Stack>
    )
}
