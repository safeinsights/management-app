'use client'

import { Stack, Title } from '@mantine/core'
import type { ReactNode } from 'react'

// The org-admin Legal center layout — the exact shell legal/page.tsx renders (title + the tab set),
// with the tab set injected as a slot. page.tsx renders THIS view with the real container, so the
// storied layout cannot drift from the real page; a story passes a presentational stand-in.
// No breadcrumbs: OTTER-518 removes them across the app, org admin pages included.
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
