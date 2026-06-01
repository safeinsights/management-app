import { Stack, Text } from '@mantine/core'
import { Audience } from './types'

export function EmptyState({ audience }: { audience: Audience }) {
    const message =
        audience === 'reviewer' ? 'You currently do not have any studies to review' : 'You have not started a study yet'

    return (
        <Stack align="center" gap="md">
            <Text>{message}</Text>
        </Stack>
    )
}
