'use client'

import { useEffect, useRef } from 'react'

// TODO(OTTER-523): replace single-editor auto-save with concurrent-editing-aware sync.
// Current behaviour: saveDraft fires 2.5s after the last dirty change, with a 45s interval backup.
const DEBOUNCE_MS = 2500
const INTERVAL_MS = 45000

interface UseAutoSaveOptions {
    isDirty: boolean
    isSaving: boolean
    saveDraft: () => Promise<boolean>
}

export function useAutoSave({ isDirty, isSaving, saveDraft }: UseAutoSaveOptions) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (!isDirty || isSaving) return

        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            void saveDraft()
        }, DEBOUNCE_MS)

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [isDirty, isSaving, saveDraft])

    useEffect(() => {
        intervalRef.current = setInterval(() => {
            if (isDirty && !isSaving) void saveDraft()
        }, INTERVAL_MS)
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [isDirty, isSaving, saveDraft])
}
