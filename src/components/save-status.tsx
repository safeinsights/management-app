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

// Holds the saved label, or passes it straight through on a surface that announces from one
// shared region instead (see SaveStatusAnnouncer). Carries no accessible name on purpose:
// several screen readers speak a live region's name ahead of its content, which would turn one
// announcement into "Autosave status, All changes saved" on every save. `data-testid` gives tests
// something unambiguous to select, since a page legitimately holds one region per save source.
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

/**
 * Announces a save once for a surface that draws several indicators from a single save source.
 *
 * Live regions are announced independently, so three field indicators mirroring one Yjs provider
 * mean three announcements per save cycle. Pair this with `announce={false}` on those indicators:
 * they keep their visible labels and this one region does the talking.
 */
export const SaveStatusAnnouncer: FC<{ status: SaveStatusValue }> = ({ status }) => (
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true" data-testid="autosave-announcer">
        {announcedText(status)}
    </VisuallyHidden>
)

/**
 * Collapses the per-field statuses of one save source into the single status to announce.
 *
 * Each field is already gated on whether the user edited it and whether a validation error owns
 * its row, so "any field is showing saved" is what the announcement should follow: it never
 * claims a save the user cannot see confirmed somewhere on screen.
 */
export const announcedSaveStatus = (statuses: SaveStatusValue[]): SaveStatusValue =>
    statuses.includes('saved') ? 'saved' : 'idle'

interface SaveStatusIndicatorProps {
    status: SaveStatusValue
    /** False while the field's validation error is showing, since the error takes the slot (OTTER-674). */
    isVisible?: boolean
    /**
     * False on a surface where several indicators share one save source and a single
     * {@link SaveStatusAnnouncer} announces for all of them. The visible label is unchanged;
     * only this indicator's own live region is dropped.
     */
    announce?: boolean
}

// Single autosave indicator shared across every surface (collaborative editor,
// proposal fields, resubmission note). Draws no visible label until there is something to
// report, so it can be dropped under any field unconditionally.
export const SaveStatusIndicator: FC<SaveStatusIndicatorProps> = ({ status, isVisible = true, announce = true }) => {
    // Collapsing a hidden indicator to 'idle' empties the region rather than unmounting it, so a
    // save that lands while an error owns the slot is announced when the error clears, not lost.
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
            <SavedLiveRegion isVisible={announce}>
                <SavedLabel isVisible={shown === 'saved'} />
            </SavedLiveRegion>
        </>
    )
}
