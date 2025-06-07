'use client'

import { Text, Grid, Stack, Flex, Title, Button, Divider } from '@mantine/core'
import { type Org } from '@/schema/org'

interface OrganizationSettingsDisplayProps {
    org: Org
    onStartEdit: () => void
}

export function OrganizationSettingsDisplay({ org, onStartEdit }: OrganizationSettingsDisplayProps) {
    const labelSpan = { base: 12, sm: 3, md: 2, lg: 2 }
    const valueSpan = { base: 12, sm: 9, md: 6, lg: 4 }

    return (
        <>
            <Flex direction="row" justify={'space-between'} align="center" mb="lg">
                <Title order={3}>About organization</Title>
                <Button variant="subtle" onClick={onStartEdit}>
                    Edit
                </Button>
            </Flex>
            <Divider mb="lg" />
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
                        <Text size="sm" c={org.description ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>
                            {org.description || 'Not set'}
                        </Text>
                    </Grid.Col>
                </Grid>
            </Stack>
        </>
    )
}
