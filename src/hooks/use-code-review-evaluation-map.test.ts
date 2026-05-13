import { vi } from 'vitest'
import * as Y from 'yjs'
import { useForm } from '@mantine/form'
import { act, beforeEach, describe, expect, it, renderHook, waitFor } from '@/tests/unit.helpers'

import { type CodeReviewCriteriaDraft, useCodeReviewEvaluationMap } from './use-code-review-evaluation-map'

type Listener = () => void

// Minimal HocuspocusProvider stand-in for the criteria bridge: exposes a real
// Y.Doc so we can drive map mutations directly, plus a `synced` event surface.
function createFakeProvider(doc: Y.Doc) {
    const syncedListeners: Listener[] = []
    return {
        document: doc,
        isSynced: false,
        on(event: string, fn: Listener) {
            if (event === 'synced') syncedListeners.push(fn)
        },
        off(event: string, fn: Listener) {
            if (event === 'synced') {
                const idx = syncedListeners.indexOf(fn)
                if (idx >= 0) syncedListeners.splice(idx, 1)
            }
        },
        triggerSynced() {
            this.isSynced = true
            syncedListeners.forEach((fn) => fn())
        },
    }
}

const initialDraft: CodeReviewCriteriaDraft = {
    proposalAlignment: null,
    agreementCompliance: null,
    securityChecks: null,
    privacyProtection: null,
}

const setupHook = ({
    provider,
    enabled = true,
}: {
    provider: ReturnType<typeof createFakeProvider> | null
    enabled?: boolean
}) => {
    const { result: formResult } = renderHook(() =>
        useForm<{ criteria: CodeReviewCriteriaDraft }>({
            mode: 'uncontrolled',
            initialValues: { criteria: initialDraft },
        }),
    )
    const form = formResult.current
    const hook = renderHook(() =>
        useCodeReviewEvaluationMap({
            form,
            provider: provider as unknown as Parameters<typeof useCodeReviewEvaluationMap>[0]['provider'],
            enabled,
        }),
    )
    return { form, hook }
}

describe('useCodeReviewEvaluationMap', () => {
    let docA: Y.Doc
    let docB: Y.Doc
    let providerA: ReturnType<typeof createFakeProvider>
    let providerB: ReturnType<typeof createFakeProvider>

    beforeEach(() => {
        docA = new Y.Doc()
        docB = new Y.Doc()
        providerA = createFakeProvider(docA)
        providerB = createFakeProvider(docB)
    })

    const syncDocs = (source: Y.Doc, target: Y.Doc) => {
        const update = Y.encodeStateAsUpdate(source, Y.encodeStateVector(target))
        Y.applyUpdate(target, update)
    }

    it('applies remote map values onto the form on sync', async () => {
        const { form, hook } = setupHook({ provider: providerA })

        // Pre-seed the doc as if the server has the value already.
        const map = docA.getMap<unknown>('evaluationCriteria')
        map.set('proposalAlignment', 'yes')
        map.set('securityChecks', 'not-sure')

        act(() => providerA.triggerSynced())

        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        expect(form.getValues().criteria.proposalAlignment).toBe('yes')
        expect(form.getValues().criteria.securityChecks).toBe('not-sure')
        expect(form.getValues().criteria.agreementCompliance).toBeNull()
        // Resets dirty after remote apply so passive readers don't see the form as edited.
        expect(form.isDirty()).toBe(false)
    })

    it('pushCriterion writes to the Y.Map and the LOCAL_ORIGIN guard keeps the form untouched', async () => {
        const { form, hook } = setupHook({ provider: providerA })
        act(() => providerA.triggerSynced())
        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))

        // Local write through the hook. The hook does NOT touch the form on its own
        // (callers set the form value alongside pushCriterion). LOCAL_ORIGIN ensures
        // the map.observe callback skips the local mutation so we don't loop back.
        act(() => hook.result.current.pushCriterion('agreementCompliance', 'no'))

        const map = docA.getMap<unknown>('evaluationCriteria')
        expect(map.get('agreementCompliance')).toBe('no')
        expect(form.getValues().criteria.agreementCompliance).toBeNull()
    })

    it('A sets, B unsets → result is absent (unselected) on both peers', async () => {
        // Two peers, two hooks (mounted on docA and docB providers).
        const { hook: hookA } = setupHook({ provider: providerA })
        const { hook: hookB } = setupHook({ provider: providerB })

        act(() => providerA.triggerSynced())
        act(() => providerB.triggerSynced())
        await waitFor(() => expect(hookA.result.current.isSynced).toBe(true))
        await waitFor(() => expect(hookB.result.current.isSynced).toBe(true))

        // A sets a criterion.
        act(() => hookA.result.current.pushCriterion('privacyProtection', 'yes'))
        // Propagate A → B.
        syncDocs(docA, docB)

        const mapA = docA.getMap<unknown>('evaluationCriteria')
        const mapB = docB.getMap<unknown>('evaluationCriteria')
        expect(mapA.get('privacyProtection')).toBe('yes')
        expect(mapB.get('privacyProtection')).toBe('yes')

        // B unsets by passing null. Hook converts to map.delete().
        act(() => hookB.result.current.pushCriterion('privacyProtection', null))
        syncDocs(docB, docA)

        // After delete-after-set propagates back, both peers see the key as absent.
        expect(mapB.get('privacyProtection')).toBeUndefined()
        expect(mapA.get('privacyProtection')).toBeUndefined()
    })

    it('no-ops when disabled', () => {
        const { hook } = setupHook({ provider: providerA, enabled: false })
        // No sync trigger; even if we tried to push, no map exists.
        act(() => hook.result.current.pushCriterion('proposalAlignment', 'yes'))
        const map = docA.getMap<unknown>('evaluationCriteria')
        expect(map.get('proposalAlignment')).toBeUndefined()
    })

    it('ignores malformed remote values (not in the enum)', async () => {
        const { form, hook } = setupHook({ provider: providerA })
        const map = docA.getMap<unknown>('evaluationCriteria')
        map.set('proposalAlignment', 'maybe')

        act(() => providerA.triggerSynced())
        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))

        expect(form.getValues().criteria.proposalAlignment).toBeNull()
    })
})

// Quiet console.warn from any auth-failure paths the hook might log.
vi.spyOn(console, 'warn').mockImplementation(() => {})
