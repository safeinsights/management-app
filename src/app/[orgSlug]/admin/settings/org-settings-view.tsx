'use client'

import type { ReactNode } from 'react'
import { Stack, Title } from '@mantine/core'

// page.tsx renders this view with the real containers, so the storied layout cannot drift from
// the real page; each data-coupled section arrives as a slot.
export type OrgSettingsViewProps = {
    orgSettings: ReactNode
    apiKeys: ReactNode
    codeEnvs: ReactNode
    dataSources: ReactNode
}

export function OrgSettingsView({ orgSettings, apiKeys, codeEnvs, dataSources }: OrgSettingsViewProps) {
    return (
        <Stack p="md">
            <Title order={1} mb="xl">
                Settings
            </Title>
            {orgSettings}
            {apiKeys}
            {codeEnvs}
            {dataSources}
        </Stack>
    )
}
