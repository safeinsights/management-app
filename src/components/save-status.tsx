import { FC } from 'react'
import { Text } from '@mantine/core'

export type SaveStatusValue = 'idle' | 'saving' | 'saved'

const SAVE_STATUS_LABELS: Record<Exclude<SaveStatusValue, 'idle'>, string> = {
    saving: 'Saving…',
    saved: 'All changes saved',
}

interface SaveStatusIndicatorProps {
    status: SaveStatusValue
}

// Single autosave indicator shared across every surface (collaborative editor,
// proposal fields, resubmission note). Renders nothing until there is something
// to report so it can be dropped under any field unconditionally.
export const SaveStatusIndicator: FC<SaveStatusIndicatorProps> = ({ status }) => {
    if (status === 'idle') return null

    return (
        <Text size="xs" c="dimmed" data-testid="autosave-status">
            {SAVE_STATUS_LABELS[status]}
        </Text>
    )
}
