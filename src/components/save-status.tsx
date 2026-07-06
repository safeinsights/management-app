'use client'

import { FC } from 'react'
import { Group, Text, useMantineTheme } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr'

export type SaveStatusValue = 'idle' | 'saving' | 'saved'

const SavingLabel: FC = () => (
    <Text size="xs" c="dimmed" data-testid="autosave-status">
        Saving…
    </Text>
)

const SavedLabel: FC = () => {
    const theme = useMantineTheme()

    return (
        <Group gap={4} wrap="nowrap" data-testid="autosave-status">
            <CheckCircleIcon size={16} color={theme.colors.green[9]} weight="fill" />
            <Text size="xs" c="green.9" fw={600}>
                All changes saved
            </Text>
        </Group>
    )
}

interface SaveStatusIndicatorProps {
    status: SaveStatusValue
}

// Single autosave indicator shared across every surface (collaborative editor,
// proposal fields, resubmission note). Renders nothing until there is something
// to report so it can be dropped under any field unconditionally.
export const SaveStatusIndicator: FC<SaveStatusIndicatorProps> = ({ status }) => {
    if (status === 'saving') return <SavingLabel />
    if (status === 'saved') return <SavedLabel />
    return null
}
