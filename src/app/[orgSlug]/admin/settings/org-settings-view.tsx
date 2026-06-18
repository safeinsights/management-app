'use client'

import type { ReactNode } from 'react'
import { Stack, Title } from '@mantine/core'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { Routes } from '@/lib/routes'

// The org-admin Settings page layout — the exact shell settings/page.tsx renders (breadcrumbs +
// title + the four stacked sections), with each data/session-coupled section injected as a slot.
// page.tsx renders THIS view with the real containers, so the storied layout can't drift from the
// real page; a story passes presentational stand-ins for the four slots.
export type OrgSettingsViewProps = {
    orgSettings: ReactNode
    apiKeys: ReactNode
    codeEnvs: ReactNode
    dataSources: ReactNode
}

export function OrgSettingsView({ orgSettings, apiKeys, codeEnvs, dataSources }: OrgSettingsViewProps) {
    return (
        <Stack p="md">
            <PageBreadcrumbs crumbs={[['Dashboard', Routes.home], ['Admin'], ['Settings']]} />
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
