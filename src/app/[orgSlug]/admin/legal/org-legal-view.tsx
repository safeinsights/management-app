'use client'

import { Stack, Title } from '@mantine/core'
import type { ReactNode } from 'react'

// The shell legal/page.tsx renders, with the tabs injected as a slot so the story cannot drift from
// the real page. No breadcrumbs: they are being removed app-wide.
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
