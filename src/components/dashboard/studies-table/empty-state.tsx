import { Stack, Text } from '@mantine/core'
import { Audience, Scope } from './types'

// 'My dashboard' (user scope) uses participation-focused copy so dual-role users get a
// role-specific empty state (OTTER-517). The org dashboards keep their existing copy.
const MESSAGES: Record<Scope, Record<Audience, string>> = {
    user: {
        reviewer: "You haven't yet participated in reviewing a study",
        researcher: "You haven't yet participated in a study",
    },
    org: {
        reviewer: 'You have no studies to review',
        researcher: "You haven't started a study yet",
    },
}

export function EmptyState({ audience, scope }: { audience: Audience; scope: Scope }) {
    return (
        <Stack align="center" gap="md">
            <Text>{MESSAGES[scope][audience]}</Text>
        </Stack>
    )
}
