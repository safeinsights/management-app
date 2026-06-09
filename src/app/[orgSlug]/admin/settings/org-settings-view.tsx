'use client'

import type { ReactNode } from 'react'
import { Paper, Stack, Title } from '@mantine/core'
import { OrganizationSettingsDisplay } from './organization-settings-display'
import type { Org } from '@/schema/org'

// Presentational layout for the org-admin Settings page: the page title plus the three
// stacked cards (About organization / Code Environments / Data Sources). It composes the
// already-pure card sub-views — the About card from OrganizationSettingsDisplay, and the
// Code Environments / Data Sources card shells supplied as `codeEnvs` / `dataSources`
// (the real page injects the data containers; a story injects pre-built card views). No
// data fetching or session here, so it renders in isolation (e.g. Ladle).
export type OrgSettingsViewProps = {
    org: Org
    onStartEditOrg: () => void
    codeEnvs: ReactNode
    dataSources: ReactNode
}

export function OrgSettingsView({ org, onStartEditOrg, codeEnvs, dataSources }: OrgSettingsViewProps) {
    return (
        <Stack p="md">
            <Title order={1} mb="xl">
                Settings
            </Title>
            <Paper shadow="xs" p="xl" mb="xl">
                <OrganizationSettingsDisplay org={org} onStartEdit={onStartEditOrg} />
            </Paper>
            {codeEnvs}
            {dataSources}
        </Stack>
    )
}
