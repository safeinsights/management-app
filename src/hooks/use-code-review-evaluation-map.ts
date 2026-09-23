'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'
import { useYjsMapSync } from '@/hooks/use-yjs-map-sync'

export type CodeReviewCriteriaDraftValue = 'yes' | 'no' | 'not-sure' | null
export type CodeReviewCriteriaValue = Exclude<CodeReviewCriteriaDraftValue, null>

export type CodeReviewCriteriaKey = 'proposalAlignment' | 'agreementCompliance' | 'privacyProtection'

export type CodeReviewCriteriaDraft = Record<CodeReviewCriteriaKey, CodeReviewCriteriaDraftValue>
export type CodeReviewCriteria = Record<CodeReviewCriteriaKey, CodeReviewCriteriaValue>

export const CODE_REVIEW_CRITERIA_KEYS: readonly CodeReviewCriteriaKey[] = [
    'proposalAlignment',
    'agreementCompliance',
    'privacyProtection',
]

const FIELDS_MAP_NAME = 'evaluationCriteria'

const VALID_VALUES: ReadonlySet<CodeReviewCriteriaValue> = new Set(['yes', 'no', 'not-sure'])

const isValidCriterionValue = (v: unknown): v is CodeReviewCriteriaValue =>
    typeof v === 'string' && VALID_VALUES.has(v as CodeReviewCriteriaValue)

type FormShape = { criteria: CodeReviewCriteriaDraft }

type Args = {
    form: UseFormReturnType<FormShape>
    provider: HocuspocusProvider | null
    enabled: boolean
}

type Return = {
    isSynced: boolean
    pushCriterion: (key: CodeReviewCriteriaKey, value: CodeReviewCriteriaDraftValue) => void
}

export function useCodeReviewEvaluationMap({ form, provider, enabled }: Args): Return {
    // The form object is rebuilt each render but reads through to one store, so holding the first
    // one and calling getValues() still sees the latest.
    const formRef = useRef(form)
    useEffect(() => {
        formRef.current = form
    }, [form])

    const seed = useCallback((map: Y.Map<unknown>) => {
        // Pre-sync radio clicks updated the form while pushCriterion had no map to write to, so
        // without seeding them the applyRemote that follows wipes the selections.
        const localCriteria = formRef.current.getValues().criteria
        for (const key of CODE_REVIEW_CRITERIA_KEYS) {
            const local = localCriteria[key]
            if (map.get(key) === undefined && local !== null) map.set(key, local)
        }
    }, [])

    const applyRemote = useCallback((map: Y.Map<unknown>) => {
        const form = formRef.current
        const current = form.getValues().criteria
        for (const key of CODE_REVIEW_CRITERIA_KEYS) {
            const raw = map.get(key)
            const remote: CodeReviewCriteriaDraftValue = isValidCriterionValue(raw) ? raw : null
            if (current[key] === remote) continue
            form.setFieldValue(`criteria.${key}`, remote)
        }
        // Mantine's setFieldValue marks the form dirty even for programmatic writes.
        form.resetDirty()
    }, [])

    const { isSynced, transactLocal } = useYjsMapSync({
        provider,
        mapName: FIELDS_MAP_NAME,
        enabled,
        seed,
        applyRemote,
    })

    const pushCriterion = useCallback(
        (key: CodeReviewCriteriaKey, value: CodeReviewCriteriaDraftValue) => {
            transactLocal((map) => {
                // Delete rather than set(key, null) so Y.Map LWW ordering resolves a concurrent
                // set/unset as unselected (delete-after-set beats set-after-delete).
                if (value === null) {
                    map.delete(key)
                } else {
                    map.set(key, value)
                }
            })
        },
        [transactLocal],
    )

    return useMemo<Return>(() => ({ isSynced, pushCriterion }), [isSynced, pushCriterion])
}
