'use client'

import { FC } from 'react'
import { Box, Group, Text, useMantineTheme } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr'

export type SaveStatusValue = 'idle' | 'saving' | 'saved'

const SavingLabel: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <Text size="xs" c="dimmed" data-testid="autosave-status">
            Saving…
        </Text>
    )
}

const SavedLabel: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    const theme = useMantineTheme()

    if (!isVisible) return null

    return (
        <Group gap={8} wrap="nowrap" data-testid="autosave-status">
            <CheckCircleIcon size={16} color={theme.colors.green[9]} weight="fill" />
            <Text size="xs" c="green.9" fw={600}>
                All changes saved
            </Text>
        </Group>
    )
}

interface SaveStatusIndicatorProps {
    status: SaveStatusValue
    /** False while the field's validation error is showing — the error takes the slot (OTTER-674). */
    isVisible?: boolean
}

// Single autosave indicator shared across every surface (collaborative editor,
// proposal fields, resubmission note). Draws no visible label until there is something to
// report, so it can be dropped under any field unconditionally.
export const SaveStatusIndicator: FC<SaveStatusIndicatorProps> = ({ status, isVisible = true }) => {
    const shown = isVisible ? status : 'idle'

    return (
        <>
            {/* Deliberately outside the live region. "Saving…" is transient and flips back to
                "saved" on every pause in typing, so announcing it too would double the
                interruptions the AC asks us to hold down. It stays plain visible text, which a
                screen reader still reads when the user navigates to it (OTTER-675). */}
            <SavingLabel isVisible={shown === 'saving'} />
            {/* The region is mounted unconditionally and starts empty. A live region is only
                announced when content it already owns changes, so mounting the wrapper together
                with its text (what returning null while idle did) left screen reader users with
                no confirmation that their work was saved. `role="status"` and `aria-live` are
                both spelled out because AT/browser pairs differ on which one they act on. */}
            <Box role="status" aria-live="polite" aria-atomic="true">
                <SavedLabel isVisible={shown === 'saved'} />
            </Box>
        </>
    )
}
