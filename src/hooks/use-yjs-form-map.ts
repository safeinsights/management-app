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
    /** The DRAFT Step 2 editor omits `title` because Step 1 owns that column (OTTER-690). */
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
    // Keyed on contents, not array identity, so a caller passing a fresh literal each render does
    // not tear down and rebuild the provider.
    const collabKeysKey = collabKeys.join(',')
    const { getToken } = useAuth()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
    const [fieldsMap, setFieldsMap] = useState<Y.Map<unknown> | null>(null)
    const [isSynced, setIsSynced] = useState(false)
    // Seeding on first sync writes through the map directly rather than push*, so it never counts
    // as an edit and the autosave indicator stays hidden on untouched fields.
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
                // The Y.Doc never connects, but local form values keep working uncollaboratively.
                console.warn(`HocuspocusProvider auth failed for ${docName}`)
            },
        } as ConstructorParameters<typeof HocuspocusProvider>[0])

        // With a shared websocketProvider the constructor leaves manageSocket=false and does not
        // register the provider, so without attach() no SYNC_STEP1 ever leaves the client.
        next.attach()

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
            // Edits are scoped to a provider session; stale flags would resurface the indicator
            // after a reconnect without a new local edit.
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
            // Mantine's setFieldValue marks the form dirty even for programmatic writes, hence the
            // resetDirty() after the batch.
            form.setFieldValue(key, value as ProposalFormValues[typeof key])
        }
        form.resetDirty()
    } finally {
        isApplyingRemoteRef.current = false
    }
}
