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
    /**
     * Which fields this surface co-edits. Defaults to every collaborative key, which is what the
     * CHANGE-REQUESTED resubmit flow needs. The DRAFT Step 2 editor passes a reduced set that
     * leaves `title` out, because Step 1 owns that column now (OTTER-690) and seeding or applying
     * a Yjs `title` there would let the collaborative copy overwrite the Step 1 one.
     */
    collabKeys?: readonly CollabFieldKey[]
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

const DEFAULT_SEEDS: Record<CollabFieldKey, (values: ProposalFormValues) => unknown> = {
    title: (values) => values.title ?? '',
    datasets: (values) => values.datasets ?? [],
    piName: (values) => values.piName ?? '',
    piUserId: (values) => values.piUserId ?? '',
}

export function useYjsFormMap({ studyId, form, websocketProvider, collabKeys = COLLAB_FIELD_KEYS }: Args): Return {
    // The effects below key on the contents rather than on the array identity, so a caller passing
    // a fresh literal each render does not tear down and rebuild the provider on every render. The
    // effect bodies still read `collabKeys` itself, which is the value from the render that
    // scheduled them.
    const collabKeysKey = collabKeys.join(',')
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
                    for (const key of collabKeys) {
                        if (map.get(key) === undefined) map.set(key, DEFAULT_SEEDS[key](form.getValues()))
                    }
                }, LOCAL_ORIGIN)
            } else {
                applyRemoteToForm(map, form, isApplyingRemoteRef, collabKeys)
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
        // form intentionally excluded: it's recreated each render but stable via Mantine ref semantics.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [websocketProvider, studyId, getToken, collabKeysKey])

    useEffect(() => {
        if (!fieldsMap) return undefined

        const onChange = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
            if (transaction.origin === LOCAL_ORIGIN) return
            applyRemoteToForm(fieldsMap, form, isApplyingRemoteRef, collabKeys, event.keysChanged)
        }
        fieldsMap.observe(onChange)
        return () => fieldsMap.unobserve(onChange)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldsMap, collabKeysKey])

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
    collabKeys: readonly CollabFieldKey[],
    keysChanged?: Set<string>,
) {
    isApplyingRemoteRef.current = true
    try {
        for (const key of collabKeys) {
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
