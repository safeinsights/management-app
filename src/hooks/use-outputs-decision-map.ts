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

    useEffect(() => {
        if (!provider) return undefined

        const doc = provider.document
        const map = doc.getMap<unknown>(DECISION_MAP_NAME)
        let cancelled = false

        const onSynced = () => {
            if (cancelled) return

            // A radio clicked before the document arrived would otherwise be wiped by the restore
            // below, because pushDecision does nothing while the map is null.
            const local = selectedRef.current
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
            provider.off('synced', onSynced)
            setDecisionMap(null)
            setIsSynced(false)
        }
    }, [provider])

    useEffect(() => {
        if (!decisionMap) return undefined

        const onChange = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
            if (transaction.origin === LOCAL_ORIGIN) return
            applyRemote(decisionMap, onRestoreRef.current, isApplyingRemote)
        }
        decisionMap.observe(onChange)
        return () => decisionMap.unobserve(onChange)
    }, [decisionMap])

    const pushDecision = useCallback(
        (decision: OutputsDecision | null) => {
            if (!decisionMap || isApplyingRemote.current) return
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
