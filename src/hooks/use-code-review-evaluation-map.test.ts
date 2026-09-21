import { vi } from 'vitest'
import * as Y from 'yjs'
import { useForm } from '@mantine/form'
import { act, beforeEach, describe, expect, it, renderHook, waitFor } from '@/tests/unit.helpers'

import { type CodeReviewCriteriaDraft, useCodeReviewEvaluationMap } from './use-code-review-evaluation-map'

type Listener = () => void

// Exposes a real Y.Doc so tests can drive map mutations directly.
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

        const map = docA.getMap<unknown>('evaluationCriteria')
        map.set('proposalAlignment', 'yes')
        map.set('securityChecks', 'not-sure')

        act(() => providerA.triggerSynced())

        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        expect(form.getValues().criteria.proposalAlignment).toBe('yes')
        expect(form.getValues().criteria.securityChecks).toBe('not-sure')
        expect(form.getValues().criteria.agreementCompliance).toBeNull()
        expect(form.isDirty()).toBe(false)
    })

    it('pushCriterion writes to the Y.Map and the LOCAL_ORIGIN guard keeps the form untouched', async () => {
        const { form, hook } = setupHook({ provider: providerA })
        act(() => providerA.triggerSynced())
        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))

        act(() => hook.result.current.pushCriterion('agreementCompliance', 'no'))

        const map = docA.getMap<unknown>('evaluationCriteria')
        expect(map.get('agreementCompliance')).toBe('no')
        expect(form.getValues().criteria.agreementCompliance).toBeNull()
    })

    it('A sets, B unsets → result is absent (unselected) on both peers', async () => {
        const { hook: hookA } = setupHook({ provider: providerA })
        const { hook: hookB } = setupHook({ provider: providerB })

        act(() => providerA.triggerSynced())
        act(() => providerB.triggerSynced())
        await waitFor(() => expect(hookA.result.current.isSynced).toBe(true))
        await waitFor(() => expect(hookB.result.current.isSynced).toBe(true))

        act(() => hookA.result.current.pushCriterion('privacyProtection', 'yes'))
        syncDocs(docA, docB)

        const mapA = docA.getMap<unknown>('evaluationCriteria')
        const mapB = docB.getMap<unknown>('evaluationCriteria')
        expect(mapA.get('privacyProtection')).toBe('yes')
        expect(mapB.get('privacyProtection')).toBe('yes')

        act(() => hookB.result.current.pushCriterion('privacyProtection', null))
        syncDocs(docB, docA)

        expect(mapB.get('privacyProtection')).toBeUndefined()
        expect(mapA.get('privacyProtection')).toBeUndefined()
    })

    it('no-ops when disabled', () => {
        const { hook } = setupHook({ provider: providerA, enabled: false })
        act(() => hook.result.current.pushCriterion('proposalAlignment', 'yes'))
        const map = docA.getMap<unknown>('evaluationCriteria')
        expect(map.get('proposalAlignment')).toBeUndefined()
    })

    it('first-sync seed: local non-null selections survive provider sync (no clobber)', async () => {
        // Mirrors a radio clicked before fieldsMap exists, where pushCriterion no-ops.
        const { form, hook } = setupHook({ provider: providerA })
        form.setFieldValue('criteria.proposalAlignment', 'yes')

        act(() => providerA.triggerSynced())
        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))

        const map = docA.getMap<unknown>('evaluationCriteria')
        expect(map.get('proposalAlignment')).toBe('yes')
        expect(form.getValues().criteria.proposalAlignment).toBe('yes')
    })

    it('first-sync: remote value wins over local when both exist for the same key', async () => {
        const { form, hook } = setupHook({ provider: providerA })
        form.setFieldValue('criteria.proposalAlignment', 'yes')

        const map = docA.getMap<unknown>('evaluationCriteria')
        map.set('proposalAlignment', 'no')

        act(() => providerA.triggerSynced())
        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))

        expect(map.get('proposalAlignment')).toBe('no')
        expect(form.getValues().criteria.proposalAlignment).toBe('no')
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

vi.spyOn(console, 'warn').mockImplementation(() => {})
