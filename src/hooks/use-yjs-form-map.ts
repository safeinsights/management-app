'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { type UseFormReturnType } from '@mantine/form'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import * as Y from 'yjs'

import { isActionError } from '@/lib/errors'
import { proposalFieldsDocName } from '@/lib/collaboration-documents'
import { getYjsDocumentUpdatedAtAction } from '@/server/actions/editor.actions'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

export type CollabFieldKey = 'title' | 'datasets' | 'piName' | 'piUserId'

const COLLAB_FIELD_KEYS: CollabFieldKey[] = ['title', 'datasets', 'piName', 'piUserId']
const FIELDS_MAP_NAME = 'fields'
const SUBMISSION_KEY = '_submission'

const LOCAL_ORIGIN = Symbol('use-yjs-form-map.local')

type Args = {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    websocketProvider: HocuspocusProviderWebsocket | null
    /** When false the hook is inert; lets callers gate the feature behind a flag. */
    enabled: boolean
}

type Return = {
    provider: HocuspocusProvider | null
    fieldsMap: Y.Map<unknown> | null
    isSynced: boolean
    pushField: <K extends CollabFieldKey>(key: K, value: ProposalFormValues[K]) => void
    pushPI: (piUserId: string, piName: string) => void
    setSubmissionSentinel: (payload: unknown) => void
}

const equalArrays = (a: unknown, b: unknown) =>
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])

const valuesEqual = (a: unknown, b: unknown) => {
    if (Array.isArray(a) || Array.isArray(b)) return equalArrays(a, b)
    return a === b
}

export function useYjsFormMap({ studyId, form, websocketProvider, enabled }: Args): Return {
    const { getToken } = useAuth()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
    const [fieldsMap, setFieldsMap] = useState<Y.Map<unknown> | null>(null)
    const [isSynced, setIsSynced] = useState(false)
    const isApplyingRemoteRef = useRef(false)

    useEffect(() => {
        if (!enabled || !websocketProvider) return undefined

        const doc = new Y.Doc()
        const docName = proposalFieldsDocName(studyId)
        const next = new HocuspocusProvider({
            websocketProvider,
            name: docName,
            document: doc,
            token: async () => (await getToken()) ?? '',
            onAuthenticationFailed: () => {
                // Auth failures here mean the proposal-fields Y.Doc never connects.
                // Local form values continue to work; the broader feature-flag fallback
                // path renders a non-collaborative form. Log and let cleanup tear the
                // provider down on unmount or next dep change.
                console.warn(`HocuspocusProvider auth failed for ${docName}`)
            },
        } as ConstructorParameters<typeof HocuspocusProvider>[0])

        // With a shared websocketProvider the constructor leaves manageSocket=false and
        // does NOT register the provider. Without this attach() the document never
        // syncs (no SYNC_STEP1 ever leaves the client).
        next.attach()

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
        }
        // form intentionally excluded — it's recreated each render but stable via Mantine ref semantics.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, websocketProvider, studyId, getToken])

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
            pushField(key, value) {
                if (!fieldsMap) return
                if (isApplyingRemoteRef.current) return
                const current = fieldsMap.get(key)
                if (valuesEqual(current, value)) return
                fieldsMap.doc?.transact(() => fieldsMap.set(key, value), LOCAL_ORIGIN)
            },
            pushPI(piUserId, piName) {
                if (!fieldsMap) return
                if (isApplyingRemoteRef.current) return
                fieldsMap.doc?.transact(() => {
                    fieldsMap.set('piUserId', piUserId)
                    fieldsMap.set('piName', piName)
                }, LOCAL_ORIGIN)
            },
            setSubmissionSentinel(payload) {
                if (!fieldsMap) return
                fieldsMap.doc?.transact(() => fieldsMap.set(SUBMISSION_KEY, payload), LOCAL_ORIGIN)
            },
        }),
        [provider, fieldsMap, isSynced],
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
