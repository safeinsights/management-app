'use client'

import { Text, Grid, Stack } from '@mantine/core'
import { type Org } from '@/schema/org'
import { orgSettingsLabelSpan, orgSettingsValueSpan } from './organization-settings-manager'

interface OrganizationSettingsDisplayProps {
    org: Pick<Org, 'name' | 'description'>
}

export function OrganizationSettingsDisplay({ org }: OrganizationSettingsDisplayProps) {
    return (
        <Stack gap="lg">
            <Grid align="flex-start">
                <Grid.Col span={orgSettingsLabelSpan}>
                    <Text fw={600} size="sm">
                        Name
                    </Text>
                </Grid.Col>
                <Grid.Col span={orgSettingsValueSpan}>
                    <Text size="sm">{org.name}</Text>
                </Grid.Col>
            </Grid>
            <Grid align="flex-start">
                <Grid.Col span={orgSettingsLabelSpan}>
                    <Text fw={600} size="sm">
                        Description
                    </Text>
                </Grid.Col>
                <Grid.Col span={orgSettingsValueSpan}>
                    <Text
                        size="sm"
                        c={org.description ? undefined : 'dimmed'}
                        style={{ whiteSpace: 'pre-wrap' }}
                    >
                        {org.description || 'Not set'}
                    </Text>
                </Grid.Col>
            </Grid>
        </Stack>
    )
}
