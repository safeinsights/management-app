'use client'

import { FC, ReactNode } from 'react'
import { Box, Group, Text, VisuallyHidden, useMantineTheme } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr'

export type SaveStatusValue = 'idle' | 'saving' | 'saved'

export const SAVED_LABEL = 'All changes saved'

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
                {SAVED_LABEL}
            </Text>
        </Group>
    )
}

// No accessible name on purpose: several screen readers speak a live region's name ahead of its
// content, turning every save into "Autosave status, All changes saved".
const SavedLiveRegion: FC<{ isVisible: boolean; children: ReactNode }> = ({ isVisible, children }) => {
    if (!isVisible) return <>{children}</>

    return (
        <Box role="status" aria-live="polite" aria-atomic="true" data-testid="autosave-live-region">
            {children}
        </Box>
    )
}

// Empty until a save lands, so the region owns its content before the text arrives.
const announcedText = (status: SaveStatusValue) => (status === 'saved' ? SAVED_LABEL : '')

// Pair with `announce={false}` on indicators sharing one save source, which would otherwise
// each announce per save cycle.
export const SaveStatusAnnouncer: FC<{ status: SaveStatusValue }> = ({ status }) => (
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true" data-testid="autosave-announcer">
        {announcedText(status)}
    </VisuallyHidden>
)

export const announcedSaveStatus = (statuses: SaveStatusValue[]): SaveStatusValue =>
    statuses.includes('saved') ? 'saved' : 'idle'

interface SaveStatusIndicatorProps {
    status: SaveStatusValue
    /** False while the field's validation error is showing, since the error takes the slot (OTTER-674). */
    isVisible?: boolean
    /** False where a shared {@link SaveStatusAnnouncer} announces instead; the visible label stays. */
    announce?: boolean
}

export const SaveStatusIndicator: FC<SaveStatusIndicatorProps> = ({ status, isVisible = true, announce = true }) => {
    // Collapsing a hidden indicator to 'idle' empties the region rather than unmounting it, so a
    // save that lands while an error owns the slot is announced when the error clears, not lost.
    const shown = isVisible ? status : 'idle'

    return (
        <>
            {/* Outside the live region on purpose: "Saving…" flips back on every typing pause,
                so announcing it would double the interruptions (OTTER-675). */}
            <SavingLabel isVisible={shown === 'saving'} />
            {/* Mounted unconditionally and starting empty: a live region is only announced when
                content it already owns changes. */}
            <SavedLiveRegion isVisible={announce}>
                <SavedLabel isVisible={shown === 'saved'} />
            </SavedLiveRegion>
        </>
    )
}
