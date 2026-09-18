'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'
import { useYjsMapSync } from '@/hooks/use-yjs-map-sync'
import { OUTPUTS_DECISIONS, type OutputsDecision } from '@/lib/outputs-review'

/**
 * Keeps the draft decision beside the Lexical feedback text, inside the same
 * `outputs-review-feedback-<jobId>` document. The feedback survived a reload and the radio did not,
 * because nothing persisted the radio at all (OTTER-758). Sharing the document means the decision
 * inherits the authorization and the submit-time teardown the feedback already has.
 *
 * A restored value is a remembered choice, not a submitted decision: nothing here writes study
 * status, and nothing here validates.
 */
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

    // Written by the click itself rather than by the effect above, which runs a commit later: a
    // radio chosen while the document was still arriving was otherwise read back as null and wiped.
    const pendingDecision = useRef<OutputsDecision | null | undefined>(undefined)
    // True once this reviewer has picked an option themselves, as opposed to being shown one the
    // document already carried.
    const hasLocalChoice = useRef(false)

    const seed = useCallback((map: Y.Map<unknown>) => {
        const local = pendingDecision.current !== undefined ? pendingDecision.current : selectedRef.current
        pendingDecision.current = undefined
        if (local !== null && map.get(DECISION_KEY) === undefined) map.set(DECISION_KEY, local)
    }, [])

    const applyRemote = useCallback((map: Y.Map<unknown>) => {
        const stored = map.get(DECISION_KEY)
        // An unreadable value selects nothing rather than a phantom option.
        onRestoreRef.current(isDecision(stored) ? stored : null)
    }, [])

    // A peer's later choice does not move a radio this reviewer picked themselves: the next click is
    // Submit, and releasing the outputs cannot be undone. A restored value is not a choice, so until
    // someone clicks the two reviewers still track each other.
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
                // Delete rather than set(key, null), so Y.Map last-writer-wins resolves a
                // concurrent set and unset as unselected.
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
