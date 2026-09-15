'use client'

import type { ReactNode } from 'react'
import { Stack } from '@mantine/core'
import { PageHeader } from '@/components/page-header'

// page.tsx renders this view with the real containers, so the storied layout cannot drift from
// the real page; each data-coupled section arrives as a slot.
export type OrgSettingsViewProps = {
    orgName: string
    orgSettings: ReactNode
    apiKeys: ReactNode
    codeEnvs: ReactNode
    dataSources: ReactNode
    testLabs: ReactNode
}

export function OrgSettingsView({
    orgName,
    orgSettings,
    apiKeys,
    codeEnvs,
    dataSources,
    testLabs,
}: OrgSettingsViewProps) {
    return (
        <Stack p="md">
            <PageHeader eyebrow={orgName} title="Settings" />
            {orgSettings}
            {apiKeys}
            {codeEnvs}
            {dataSources}
            {testLabs}
        </Stack>
    )
}
