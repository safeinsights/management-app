import { vi } from 'vitest'
import * as Y from 'yjs'
import { act, describe, expect, it, renderHook, waitFor } from '@/tests/unit.helpers'
import type { OutputsDecision } from '@/lib/outputs-review'
import { useOutputsDecisionMap } from './use-outputs-decision-map'

type Listener = () => void

// Exposes a real Y.Doc so a test can drive the map the way a peer or the server would.
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
                const index = syncedListeners.indexOf(fn)
                if (index >= 0) syncedListeners.splice(index, 1)
            }
        },
        triggerSynced() {
            this.isSynced = true
            syncedListeners.forEach((fn) => fn())
        },
    }
}

type Provider = ReturnType<typeof createFakeProvider>

const DECISION_MAP_NAME = 'outputsDecision'
const DECISION_KEY = 'decision'

const decisionMapOf = (doc: Y.Doc) => doc.getMap<unknown>(DECISION_MAP_NAME)

const setupHook = ({ provider, selected = null }: { provider: Provider | null; selected?: OutputsDecision | null }) => {
    const onRestore = vi.fn()
    const hook = renderHook(
        (props: { selected: OutputsDecision | null }) =>
            useOutputsDecisionMap({
                provider: provider as unknown as Parameters<typeof useOutputsDecisionMap>[0]['provider'],
                selected: props.selected,
                onRestore,
            }),
        { initialProps: { selected } },
    )
    return { hook, onRestore }
}

describe('useOutputsDecisionMap', () => {
    it('restores a decision that the document already carries', async () => {
        const doc = new Y.Doc()
        decisionMapOf(doc).set(DECISION_KEY, 'share-feedback-only')
        const provider = createFakeProvider(doc)
        const { hook, onRestore } = setupHook({ provider })

        act(() => provider.triggerSynced())

        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        expect(onRestore).toHaveBeenCalledWith('share-feedback-only')
    })

    it('reports no decision when the document carries none', async () => {
        const provider = createFakeProvider(new Y.Doc())
        const { hook, onRestore } = setupHook({ provider })

        act(() => provider.triggerSynced())

        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        expect(onRestore).toHaveBeenCalledWith(null)
    })

    it('ignores a stored value that is not one of the two decisions', async () => {
        const doc = new Y.Doc()
        decisionMapOf(doc).set(DECISION_KEY, 'share-everything-forever')
        const provider = createFakeProvider(doc)
        const { hook, onRestore } = setupHook({ provider })

        act(() => provider.triggerSynced())

        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        expect(onRestore).toHaveBeenCalledWith(null)
    })

    it('keeps a choice made before the document arrived, rather than wiping it', async () => {
        const doc = new Y.Doc()
        const provider = createFakeProvider(doc)
        const { hook, onRestore } = setupHook({ provider, selected: 'share-outputs' })

        act(() => provider.triggerSynced())

        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        expect(decisionMapOf(doc).get(DECISION_KEY)).toBe('share-outputs')
        expect(onRestore).toHaveBeenCalledWith('share-outputs')
    })

    it('keeps a decision chosen before the document arrived, even before the prop catches up', async () => {
        const doc = new Y.Doc()
        const provider = createFakeProvider(doc)
        const { hook } = setupHook({ provider })

        // The click lands before the sync and `selected` never catches up, which is the ordering
        // the effect refreshing selectedRef cannot guarantee.
        act(() => hook.result.current.pushDecision('share-outputs'))
        act(() => provider.triggerSynced())

        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        expect(decisionMapOf(doc).get(DECISION_KEY)).toBe('share-outputs')
    })

    it('lets the document win over a local choice it already disagrees with', async () => {
        const doc = new Y.Doc()
        decisionMapOf(doc).set(DECISION_KEY, 'share-feedback-only')
        const provider = createFakeProvider(doc)
        const { hook, onRestore } = setupHook({ provider, selected: 'share-outputs' })

        act(() => provider.triggerSynced())

        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        expect(onRestore).toHaveBeenCalledWith('share-feedback-only')
    })

    it('writes a chosen decision into the document', async () => {
        const doc = new Y.Doc()
        const provider = createFakeProvider(doc)
        const { hook } = setupHook({ provider })
        act(() => provider.triggerSynced())
        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))

        act(() => hook.result.current.pushDecision('share-outputs'))

        expect(decisionMapOf(doc).get(DECISION_KEY)).toBe('share-outputs')
    })

    it('clears the key instead of storing null, so a concurrent unset wins', async () => {
        const doc = new Y.Doc()
        const provider = createFakeProvider(doc)
        const { hook } = setupHook({ provider })
        act(() => provider.triggerSynced())
        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))

        act(() => hook.result.current.pushDecision('share-outputs'))
        act(() => hook.result.current.pushDecision(null))

        expect(decisionMapOf(doc).has(DECISION_KEY)).toBe(false)
    })

    it('applies a decision a peer makes later', async () => {
        const doc = new Y.Doc()
        const provider = createFakeProvider(doc)
        const { hook, onRestore } = setupHook({ provider })
        act(() => provider.triggerSynced())
        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        onRestore.mockClear()

        act(() => {
            decisionMapOf(doc).set(DECISION_KEY, 'share-feedback-only')
        })

        expect(onRestore).toHaveBeenCalledWith('share-feedback-only')
    })

    it('applies a peer update that lands in the same tick as the sync', async () => {
        const doc = new Y.Doc()
        const provider = createFakeProvider(doc)
        const { hook, onRestore } = setupHook({ provider })

        act(() => {
            provider.triggerSynced()
            decisionMapOf(doc).set(DECISION_KEY, 'share-feedback-only')
        })

        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        expect(onRestore).toHaveBeenCalledWith('share-feedback-only')
    })

    it('leaves a decision this reviewer picked when a peer picks the other one', async () => {
        const doc = new Y.Doc()
        const provider = createFakeProvider(doc)
        const { hook, onRestore } = setupHook({ provider })
        act(() => provider.triggerSynced())
        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        act(() => hook.result.current.pushDecision('share-feedback-only'))
        onRestore.mockClear()

        act(() => {
            decisionMapOf(doc).set(DECISION_KEY, 'share-outputs')
        })

        // Submitting releases the outputs and cannot be undone, so a peer must not move the radio
        // out from under the reviewer about to click it.
        expect(onRestore).not.toHaveBeenCalled()
    })

    it('does not echo its own write back as a restore', async () => {
        const doc = new Y.Doc()
        const provider = createFakeProvider(doc)
        const { hook, onRestore } = setupHook({ provider })
        act(() => provider.triggerSynced())
        await waitFor(() => expect(hook.result.current.isSynced).toBe(true))
        onRestore.mockClear()

        act(() => hook.result.current.pushDecision('share-outputs'))

        expect(onRestore).not.toHaveBeenCalled()
    })

    it('stays quiet and does not throw without a provider, as in single user editing', () => {
        const { hook, onRestore } = setupHook({ provider: null })

        act(() => hook.result.current.pushDecision('share-outputs'))

        expect(hook.result.current.isSynced).toBe(false)
        expect(onRestore).not.toHaveBeenCalled()
    })
})
