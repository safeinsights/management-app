'use client'

import { Text, Grid, Stack } from '@mantine/core'
import { type Org } from '@/schema/org'

interface OrganizationSettingsDisplayProps {
    org: Pick<Org, 'name' | 'description'>
}

export function OrganizationSettingsDisplay({ org }: OrganizationSettingsDisplayProps) {
    const labelSpan = { base: 12, sm: 3, md: 2, lg: 2 }
    const valueSpan = { base: 12, sm: 9, md: 6, lg: 4 }

    return (
        <Stack gap="lg">
            <Grid align="flex-start">
                <Grid.Col span={labelSpan}>
                    <Text fw={600} size="sm">
                        Name
                    </Text>
                </Grid.Col>
                <Grid.Col span={valueSpan}>
                    <Text size="sm">{org.name}</Text>
                </Grid.Col>
            </Grid>
            <Grid align="flex-start">
                <Grid.Col span={labelSpan}>
                    <Text fw={600} size="sm">
                        Description
                    </Text>
                </Grid.Col>
                <Grid.Col span={valueSpan}>
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
