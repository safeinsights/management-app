'use client'

import { FC, useEffect, useState } from 'react'
import { Loader, Group, Text } from '@mantine/core'

interface AutoSaveIndicatorProps {
    isSaving: boolean
    lastSavedAt: Date | null
}

const REFRESH_MS = 30_000

function formatMinutesAgo(savedAt: Date, now: Date): string {
    const minutes = Math.max(0, Math.floor((now.getTime() - savedAt.getTime()) / 60_000))
    if (minutes === 0) return 'Last saved just now'
    if (minutes === 1) return 'Last saved 1 minute ago'
    return `Last saved ${minutes} minutes ago`
}

export const AutoSaveIndicator: FC<AutoSaveIndicatorProps> = ({ isSaving, lastSavedAt }) => {
    const [now, setNow] = useState<Date>(() => new Date())

    useEffect(() => {
        if (!lastSavedAt) return
        const id = setInterval(() => setNow(new Date()), REFRESH_MS)
        return () => clearInterval(id)
    }, [lastSavedAt])

    if (isSaving) {
        return (
            <Group gap={6} aria-live="polite">
                <Loader size="xs" />
                <Text size="xs" c="charcoal.7">
                    Saving progress…
                </Text>
            </Group>
        )
    }

    if (!lastSavedAt) return null

    return (
        <Text size="xs" c="charcoal.7" aria-live="polite">
            {formatMinutesAgo(lastSavedAt, now)}
        </Text>
    )
}
