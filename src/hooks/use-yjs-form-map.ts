'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { type UseFormReturnType } from '@mantine/form'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import * as Y from 'yjs'

import { isActionError } from '@/lib/errors'
import { PROPOSAL_FIELDS_MAP_NAME, proposalFieldsDocName } from '@/lib/collaboration-documents'
import { getYjsDocumentUpdatedAtAction } from '@/server/actions/editor.actions'
import {
    COLLAB_FIELD_KEYS,
    type CollabFieldKey,
    type ProposalFormValues,
} from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

const FIELDS_MAP_NAME = PROPOSAL_FIELDS_MAP_NAME

const LOCAL_ORIGIN = Symbol('use-yjs-form-map.local')

type Args = {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    websocketProvider: HocuspocusProviderWebsocket | null
}

type Return = {
    provider: HocuspocusProvider | null
    fieldsMap: Y.Map<unknown> | null
    isSynced: boolean
    editedKeys: ReadonlySet<CollabFieldKey>
    pushField: <K extends CollabFieldKey>(key: K, value: ProposalFormValues[K]) => void
    pushPI: (piUserId: string, piName: string) => void
}

const equalArrays = (a: unknown, b: unknown) =>
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])

const valuesEqual = (a: unknown, b: unknown) => {
    if (Array.isArray(a) || Array.isArray(b)) return equalArrays(a, b)
    return a === b
}

export function useYjsFormMap({ studyId, form, websocketProvider }: Args): Return {
    const { getToken } = useAuth()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
    const [fieldsMap, setFieldsMap] = useState<Y.Map<unknown> | null>(null)
    const [isSynced, setIsSynced] = useState(false)
    // Tracks which fields the user has locally edited via pushField/pushPI.
    // The initial-value seeding on first sync writes through the map directly,
    // not through push*, so it never counts as an edit — this is what keeps the
    // autosave indicator hidden under fields the user hasn't touched.
    const [editedKeys, setEditedKeys] = useState<ReadonlySet<CollabFieldKey>>(new Set())
    const isApplyingRemoteRef = useRef(false)

    const markEdited = useCallback(
        (...keys: CollabFieldKey[]) =>
            setEditedKeys((prev) => {
                if (keys.every((key) => prev.has(key))) return prev
                const next = new Set(prev)
                keys.forEach((key) => next.add(key))
                return next
            }),
        [],
    )

    useEffect(() => {
        if (!websocketProvider) return undefined

        const doc = new Y.Doc()
        const docName = proposalFieldsDocName(studyId)
        const next = new HocuspocusProvider({
            websocketProvider,
            name: docName,
            document: doc,
            token: async () => (await getToken()) ?? '',
            onAuthenticationFailed: () => {
                // Auth failures here mean the proposal-fields Y.Doc never connects.
                // Local form values keep working uncollaboratively; log and let cleanup
                // tear the provider down on unmount or next dep change.
                console.warn(`HocuspocusProvider auth failed for ${docName}`)
            },
        } as ConstructorParameters<typeof HocuspocusProvider>[0])

        // With a shared websocketProvider the constructor leaves manageSocket=false and
        // does NOT register the provider. Without this attach() the document never
        // syncs (no SYNC_STEP1 ever leaves the client).
        next.attach()

        // The Hocuspocus provider is an external resource created and torn down by this
        // effect; storing the instance in state is how consumers re-render once it exists.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- exposing an effect-created external resource
        setProvider(next)

        const onSynced = async () => {
            const map = doc.getMap<unknown>(FIELDS_MAP_NAME)
            setFieldsMap(map)

            const updatedAt = await getYjsDocumentUpdatedAtAction({ documentName: docName, studyId })
            const docExists = !isActionError(updatedAt) && updatedAt !== null

            if (!docExists) {
                doc.transact(() => {
                    if (map.get('title') === undefined) map.set('title', form.getValues().title ?? '')
                    if (map.get('datasets') === undefined) map.set('datasets', form.getValues().datasets ?? [])
                    if (map.get('piName') === undefined) map.set('piName', form.getValues().piName ?? '')
                    if (map.get('piUserId') === undefined) map.set('piUserId', form.getValues().piUserId ?? '')
                }, LOCAL_ORIGIN)
            } else {
                applyRemoteToForm(map, form, isApplyingRemoteRef)
            }

            setIsSynced(true)
        }

        if (next.isSynced) {
            onSynced()
        } else {
            next.on('synced', onSynced)
        }

        return () => {
            next.off('synced', onSynced)
            next.destroy()
            doc.destroy()
            setProvider(null)
            setFieldsMap(null)
            setIsSynced(false)
            // Edits are scoped to a provider session; a reconnect swaps in a fresh
            // provider whose status starts idle, so stale edited flags would only
            // resurface the indicator without a new local edit.
            setEditedKeys(new Set())
        }
        // form intentionally excluded — it's recreated each render but stable via Mantine ref semantics.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [websocketProvider, studyId, getToken])

    useEffect(() => {
        if (!fieldsMap) return undefined

        const onChange = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
            if (transaction.origin === LOCAL_ORIGIN) return
            applyRemoteToForm(fieldsMap, form, isApplyingRemoteRef, event.keysChanged)
        }
        fieldsMap.observe(onChange)
        return () => fieldsMap.unobserve(onChange)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldsMap])

    return useMemo(
        () => ({
            provider,
            fieldsMap,
            isSynced,
            editedKeys,
            pushField(key, value) {
                if (!fieldsMap) return
                if (isApplyingRemoteRef.current) return
                const current = fieldsMap.get(key)
                if (valuesEqual(current, value)) return
                fieldsMap.doc?.transact(() => fieldsMap.set(key, value), LOCAL_ORIGIN)
                markEdited(key)
            },
            pushPI(piUserId, piName) {
                if (!fieldsMap) return
                if (isApplyingRemoteRef.current) return
                fieldsMap.doc?.transact(() => {
                    fieldsMap.set('piUserId', piUserId)
                    fieldsMap.set('piName', piName)
                }, LOCAL_ORIGIN)
                markEdited('piUserId', 'piName')
            },
        }),
        [provider, fieldsMap, isSynced, editedKeys, markEdited],
    )
}

function applyRemoteToForm(
    map: Y.Map<unknown>,
    form: UseFormReturnType<ProposalFormValues>,
    isApplyingRemoteRef: React.MutableRefObject<boolean>,
    keysChanged?: Set<string>,
) {
    isApplyingRemoteRef.current = true
    try {
        for (const key of COLLAB_FIELD_KEYS) {
            if (keysChanged && !keysChanged.has(key)) continue
            const value = map.get(key)
            if (value === undefined) continue
            const currentValue = form.getValues()[key] as unknown
            if (valuesEqual(currentValue, value)) continue
            // Mantine's setFieldValue marks the form dirty even for programmatic writes.
            // Reset dirty after the batch so passive readers don't see the form as edited.
            form.setFieldValue(key, value as ProposalFormValues[typeof key])
        }
        form.resetDirty()
    } finally {
        isApplyingRemoteRef.current = false
    }
}
