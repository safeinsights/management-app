'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'
import { useYjsMapSync } from '@/hooks/use-yjs-map-sync'
import { OUTPUTS_DECISIONS, type OutputsDecision } from '@/lib/outputs-review'

// The draft decision shares the feedback text's document, and so its authorization and submit-time teardown
// (OTTER-758). A restored value is a remembered choice, not a submitted decision.
const DECISION_MAP_NAME = 'outputsDecision'
const DECISION_KEY = 'decision'

const isDecision = (value: unknown): value is OutputsDecision =>
    typeof value === 'string' && (OUTPUTS_DECISIONS as readonly string[]).includes(value)

type Args = {
    provider: HocuspocusProvider | null
    selected: OutputsDecision | null
    onRestore: (decision: OutputsDecision | null) => void
}

type Return = {
    isSynced: boolean
    pushDecision: (decision: OutputsDecision | null) => void
}

export function useOutputsDecisionMap({ provider, selected, onRestore }: Args): Return {
    const selectedRef = useRef(selected)
    const onRestoreRef = useRef(onRestore)
    useEffect(() => {
        selectedRef.current = selected
        onRestoreRef.current = onRestore
    }, [selected, onRestore])

    // Set by the click itself: the effect above runs a commit later, so a click before the sync read back as null.
    const pendingDecision = useRef<OutputsDecision | null | undefined>(undefined)
    // A choice this reviewer clicked, as opposed to one restored from the document.
    const hasLocalChoice = useRef(false)

    const seed = useCallback((map: Y.Map<unknown>) => {
        const local = pendingDecision.current !== undefined ? pendingDecision.current : selectedRef.current
        pendingDecision.current = undefined
        if (local === null) return
        // Hocuspocus emits `synced` again after a reconnect, and this reviewer's click must survive it.
        if (hasLocalChoice.current || map.get(DECISION_KEY) === undefined) map.set(DECISION_KEY, local)
    }, [])

    const applyRemote = useCallback((map: Y.Map<unknown>) => {
        const stored = map.get(DECISION_KEY)
        // An unreadable value selects nothing rather than a phantom option.
        onRestoreRef.current(isDecision(stored) ? stored : null)
    }, [])

    // A peer's later choice does not move a radio this reviewer clicked: the next click is Submit, which cannot
    // be undone. Until someone clicks, the reviewers track each other.
    const shouldApplyRemote = useCallback(() => !hasLocalChoice.current, [])

    const { isSynced, transactLocal } = useYjsMapSync({
        provider,
        mapName: DECISION_MAP_NAME,
        seed,
        applyRemote,
        shouldApplyRemote,
    })

    const pushDecision = useCallback(
        (decision: OutputsDecision | null) => {
            const written = transactLocal((map) => {
                // Delete, not set(null), so a concurrent set and unset resolve as unselected.
                if (decision === null) {
                    map.delete(DECISION_KEY)
                } else {
                    map.set(DECISION_KEY, decision)
                }
            })
            hasLocalChoice.current = true
            // Held for the sync rather than dropped, so a click is not lost to a slow connection.
            pendingDecision.current = written ? undefined : decision
        },
        [transactLocal],
    )

    return useMemo<Return>(() => ({ isSynced, pushDecision }), [isSynced, pushDecision])
}
