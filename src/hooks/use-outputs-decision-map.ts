'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
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

// Module-local; never share across hooks. Marks updates that must not be applied back locally.
const LOCAL_ORIGIN = Symbol('use-outputs-decision-map.local')

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

const applyRemote = (
    map: Y.Map<unknown>,
    onRestore: (decision: OutputsDecision | null) => void,
    isApplyingRemote: { current: boolean },
) => {
    isApplyingRemote.current = true
    try {
        const stored = map.get(DECISION_KEY)
        // An unreadable value selects nothing rather than a phantom option.
        onRestore(isDecision(stored) ? stored : null)
    } finally {
        isApplyingRemote.current = false
    }
}

export function useOutputsDecisionMap({ provider, selected, onRestore }: Args): Return {
    const [decisionMap, setDecisionMap] = useState<Y.Map<unknown> | null>(null)
    const [isSynced, setIsSynced] = useState(false)
    const isApplyingRemote = useRef(false)

    // Read when the document arrives rather than captured when the effect was set up: the reviewer
    // can choose an option before the sync completes.
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

    useEffect(() => {
        if (!provider) return undefined

        const doc = provider.document
        const map = doc.getMap<unknown>(DECISION_MAP_NAME)
        let cancelled = false

        let hasSynced = false

        const onChange = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
            // Before the sync the document is still catching up, and onSynced reads it below.
            if (!hasSynced || transaction.origin === LOCAL_ORIGIN) return
            // A peer's later choice does not move a radio this reviewer picked themselves: the
            // next click is Submit, and releasing the outputs cannot be undone. A restored value is
            // not a choice, so until someone clicks the two reviewers still track each other.
            if (hasLocalChoice.current) return
            applyRemote(map, onRestoreRef.current, isApplyingRemote)
        }
        // Observed before onSynced reads the map, not in a later effect: an update landing between
        // the read and the observer was lost until some other peer happened to write again.
        map.observe(onChange)

        const onSynced = () => {
            if (cancelled) return
            hasSynced = true

            // A radio clicked before the document arrived would otherwise be wiped by the restore
            // below, because pushDecision cannot write while the map is null.
            const local = pendingDecision.current !== undefined ? pendingDecision.current : selectedRef.current
            pendingDecision.current = undefined
            if (local !== null && map.get(DECISION_KEY) === undefined) {
                doc.transact(() => map.set(DECISION_KEY, local), LOCAL_ORIGIN)
            }

            applyRemote(map, onRestoreRef.current, isApplyingRemote)
            setDecisionMap(map)
            setIsSynced(true)
        }

        if (provider.isSynced) {
            onSynced()
        } else {
            provider.on('synced', onSynced)
        }

        return () => {
            cancelled = true
            map.unobserve(onChange)
            provider.off('synced', onSynced)
            setDecisionMap(null)
            setIsSynced(false)
        }
    }, [provider])

    const pushDecision = useCallback(
        (decision: OutputsDecision | null) => {
            if (isApplyingRemote.current) return
            hasLocalChoice.current = true
            // Held until the sync rather than dropped, so the click is not lost to a slow connection.
            if (!decisionMap) {
                pendingDecision.current = decision
                return
            }
            decisionMap.doc?.transact(() => {
                // Delete rather than set(key, null), so Y.Map last-writer-wins resolves a
                // concurrent set and unset as unselected.
                if (decision === null) {
                    decisionMap.delete(DECISION_KEY)
                } else {
                    decisionMap.set(DECISION_KEY, decision)
                }
            }, LOCAL_ORIGIN)
        },
        [decisionMap],
    )

    return useMemo<Return>(() => ({ isSynced, pushDecision }), [isSynced, pushDecision])
}
