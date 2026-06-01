'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

export type CodeReviewCriteriaDraftValue = 'yes' | 'no' | 'not-sure' | null
export type CodeReviewCriteriaValue = Exclude<CodeReviewCriteriaDraftValue, null>

export type CodeReviewCriteriaKey = 'proposalAlignment' | 'agreementCompliance' | 'securityChecks' | 'privacyProtection'

export type CodeReviewCriteriaDraft = Record<CodeReviewCriteriaKey, CodeReviewCriteriaDraftValue>
export type CodeReviewCriteria = Record<CodeReviewCriteriaKey, CodeReviewCriteriaValue>

export const CODE_REVIEW_CRITERIA_KEYS: readonly CodeReviewCriteriaKey[] = [
    'proposalAlignment',
    'agreementCompliance',
    'securityChecks',
    'privacyProtection',
]

const FIELDS_MAP_NAME = 'evaluationCriteria'

// Module-local; never share across hooks. Distinguishes locally-originated updates
// (which should not be re-applied to the form) from remote updates.
const LOCAL_ORIGIN = Symbol('use-code-review-evaluation-map.local')

const VALID_VALUES: ReadonlySet<CodeReviewCriteriaValue> = new Set(['yes', 'no', 'not-sure'])

const isValidCriterionValue = (v: unknown): v is CodeReviewCriteriaValue =>
    typeof v === 'string' && VALID_VALUES.has(v as CodeReviewCriteriaValue)

type FormShape = { criteria: CodeReviewCriteriaDraft }

type Args = {
    form: UseFormReturnType<FormShape>
    provider: HocuspocusProvider | null
    /** When false the hook is inert; lets callers gate the bridge on editable status. */
    enabled: boolean
}

type Return = {
    isSynced: boolean
    pushCriterion: (key: CodeReviewCriteriaKey, value: CodeReviewCriteriaDraftValue) => void
}

export function useCodeReviewEvaluationMap({ form, provider, enabled }: Args): Return {
    const [fieldsMap, setFieldsMap] = useState<Y.Map<unknown> | null>(null)
    const [isSynced, setIsSynced] = useState(false)
    const isApplyingRemoteRef = useRef(false)

    useEffect(() => {
        if (!enabled || !provider) return undefined

        const doc = provider.document
        const map = doc.getMap<unknown>(FIELDS_MAP_NAME)

        let cancelled = false

        const onSynced = () => {
            if (cancelled) return

            // Pre-sync writes (user clicked a radio while the provider was still
            // connecting) updated the form but the prior pushCriterion no-op'd
            // because fieldsMap was null. Without this seed pass, the immediately
            // following applyRemoteToForm would treat absent map keys as null and
            // wipe those local selections. On first sync, copy any local non-null
            // values into the map so they propagate instead of being clobbered.
            const localCriteria = form.getValues().criteria
            doc.transact(() => {
                for (const key of CODE_REVIEW_CRITERIA_KEYS) {
                    const local = localCriteria[key]
                    if (map.get(key) === undefined && local !== null) {
                        map.set(key, local)
                    }
                }
            }, LOCAL_ORIGIN)

            applyRemoteToForm(map, form, isApplyingRemoteRef)
            setFieldsMap(map)
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
            setFieldsMap(null)
            setIsSynced(false)
        }
        // form excluded: Mantine ref semantics keep it stable across renders.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, provider])

    useEffect(() => {
        if (!fieldsMap) return undefined

        const onChange = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
            if (transaction.origin === LOCAL_ORIGIN) return
            applyRemoteToForm(fieldsMap, form, isApplyingRemoteRef)
        }
        fieldsMap.observe(onChange)
        return () => fieldsMap.unobserve(onChange)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldsMap])

    return useMemo<Return>(
        () => ({
            isSynced,
            pushCriterion(key, value) {
                if (!fieldsMap) return
                if (isApplyingRemoteRef.current) return
                fieldsMap.doc?.transact(() => {
                    // null = unanswered = "key absent". Delete rather than set(key, null) so
                    // the AC "A sets, B unsets, peer ends up unselected" is satisfied by
                    // Y.Map LWW ordering (delete-after-set beats set-after-delete).
                    if (value === null) {
                        fieldsMap.delete(key)
                    } else {
                        fieldsMap.set(key, value)
                    }
                }, LOCAL_ORIGIN)
            },
        }),
        [fieldsMap, isSynced],
    )
}

function applyRemoteToForm(
    map: Y.Map<unknown>,
    form: UseFormReturnType<FormShape>,
    isApplyingRemoteRef: React.MutableRefObject<boolean>,
) {
    isApplyingRemoteRef.current = true
    try {
        const current = form.getValues().criteria
        for (const key of CODE_REVIEW_CRITERIA_KEYS) {
            const raw = map.get(key)
            const remote: CodeReviewCriteriaDraftValue = isValidCriterionValue(raw) ? raw : null
            if (current[key] === remote) continue
            form.setFieldValue(`criteria.${key}`, remote)
        }
        form.resetDirty()
    } finally {
        isApplyingRemoteRef.current = false
    }
}
