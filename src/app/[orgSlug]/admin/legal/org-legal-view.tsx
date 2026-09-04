'use client'

import { Stack } from '@mantine/core'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/page-header'

// The tabs are injected as a slot so a story cannot drift from the real page.
export type OrgLegalViewProps = {
    orgName: string
    tabs: ReactNode
}

export function OrgLegalView({ orgName, tabs }: OrgLegalViewProps) {
    return (
        <Stack p="md">
            <PageHeader eyebrow={orgName} title="Legal center" />
            {tabs}
        </Stack>
    )
}
