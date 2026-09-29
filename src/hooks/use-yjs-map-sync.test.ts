import { vi } from 'vitest'
import * as Y from 'yjs'
import { act, describe, expect, it, renderHook, waitFor } from '@/tests/unit.helpers'
import { createFakeYjsProvider, type FakeYjsProvider } from '@/tests/yjs.helpers'
import { useYjsMapSync } from './use-yjs-map-sync'

const MAP_NAME = 'testMap'

const mapOf = (doc: Y.Doc) => doc.getMap<unknown>(MAP_NAME)

type SetupArgs = {
    provider: FakeYjsProvider | null
    enabled?: boolean
    seed?: (map: Y.Map<unknown>) => void
    applyRemote?: (map: Y.Map<unknown>) => void
    shouldApplyRemote?: () => boolean
}

const setup = ({ provider, enabled = true, seed = () => {}, applyRemote = () => {}, shouldApplyRemote }: SetupArgs) =>
    renderHook(() =>
        useYjsMapSync({
            provider: provider as unknown as Parameters<typeof useYjsMapSync>[0]['provider'],
            mapName: MAP_NAME,
            enabled,
            seed,
            applyRemote,
            shouldApplyRemote,
        }),
    )

const seedKey = (map: Y.Map<unknown>) => {
    if (map.get('choice') === undefined) map.set('choice', 'local')
}

describe('useYjsMapSync', () => {
    it('seeds a local value the document does not carry', async () => {
        const doc = new Y.Doc()
        const provider = createFakeYjsProvider(doc)
        const { result } = setup({ provider, seed: seedKey })

        act(() => provider.triggerSynced())

        await waitFor(() => expect(result.current.isSynced).toBe(true))
        expect(mapOf(doc).get('choice')).toBe('local')
    })

    it('leaves a value the document already carries', async () => {
        const doc = new Y.Doc()
        mapOf(doc).set('choice', 'stored')
        const provider = createFakeYjsProvider(doc)
        const { result } = setup({ provider, seed: seedKey })

        act(() => provider.triggerSynced())

        await waitFor(() => expect(result.current.isSynced).toBe(true))
        expect(mapOf(doc).get('choice')).toBe('stored')
    })

    it('applies a peer update that lands in the same tick as the sync', async () => {
        const doc = new Y.Doc()
        const provider = createFakeYjsProvider(doc)
        const applyRemote = vi.fn()
        const { result } = setup({ provider, applyRemote })

        // The observer used to be installed by a later effect, so a write this close to the sync
        // was lost until some other peer happened to write again.
        act(() => {
            provider.triggerSynced()
            mapOf(doc).set('choice', 'peer')
        })

        await waitFor(() => expect(result.current.isSynced).toBe(true))
        expect(applyRemote).toHaveBeenCalledTimes(2)
    })

    it('ignores document changes that arrive before the sync', () => {
        const doc = new Y.Doc()
        const provider = createFakeYjsProvider(doc)
        const applyRemote = vi.fn()
        setup({ provider, applyRemote })

        act(() => {
            mapOf(doc).set('choice', 'early')
        })

        expect(applyRemote).not.toHaveBeenCalled()
    })

    it('does not echo its own write back as a remote one', async () => {
        const doc = new Y.Doc()
        const provider = createFakeYjsProvider(doc)
        const applyRemote = vi.fn()
        const { result } = setup({ provider, applyRemote })
        act(() => provider.triggerSynced())
        await waitFor(() => expect(result.current.isSynced).toBe(true))
        applyRemote.mockClear()

        act(() => {
            result.current.transactLocal((map) => map.set('choice', 'mine'))
        })

        expect(applyRemote).not.toHaveBeenCalled()
    })

    it('leaves local state alone when shouldApplyRemote refuses', async () => {
        const doc = new Y.Doc()
        const provider = createFakeYjsProvider(doc)
        const applyRemote = vi.fn()
        const { result } = setup({ provider, applyRemote, shouldApplyRemote: () => false })
        act(() => provider.triggerSynced())
        await waitFor(() => expect(result.current.isSynced).toBe(true))
        applyRemote.mockClear()

        act(() => {
            mapOf(doc).set('choice', 'peer')
        })

        expect(applyRemote).not.toHaveBeenCalled()
    })

    it('reports whether a write landed, so a caller can hold it for the sync', async () => {
        const doc = new Y.Doc()
        const provider = createFakeYjsProvider(doc)
        const { result } = setup({ provider })

        let beforeSync = true
        act(() => {
            beforeSync = result.current.transactLocal((map) => map.set('choice', 'early'))
        })
        expect(beforeSync).toBe(false)

        act(() => provider.triggerSynced())
        await waitFor(() => expect(result.current.isSynced).toBe(true))

        let afterSync = false
        act(() => {
            afterSync = result.current.transactLocal((map) => map.set('choice', 'late'))
        })
        expect(afterSync).toBe(true)
        expect(mapOf(doc).get('choice')).toBe('late')
    })

    it('gives each instance its own origin, so a sibling on the same map still sees the write', async () => {
        const doc = new Y.Doc()
        const provider = createFakeYjsProvider(doc)
        const applyRemoteA = vi.fn()
        const applyRemoteB = vi.fn()
        const a = setup({ provider, applyRemote: applyRemoteA })
        const b = setup({ provider, applyRemote: applyRemoteB })
        act(() => provider.triggerSynced())
        await waitFor(() => expect(a.result.current.isSynced).toBe(true))
        await waitFor(() => expect(b.result.current.isSynced).toBe(true))
        applyRemoteA.mockClear()
        applyRemoteB.mockClear()

        act(() => {
            a.result.current.transactLocal((map) => map.set('choice', 'from-a'))
        })

        expect(applyRemoteA).not.toHaveBeenCalled()
        expect(applyRemoteB).toHaveBeenCalled()
    })

    it('stops observing once unmounted', async () => {
        const doc = new Y.Doc()
        const provider = createFakeYjsProvider(doc)
        const applyRemote = vi.fn()
        const { result, unmount } = setup({ provider, applyRemote })
        act(() => provider.triggerSynced())
        await waitFor(() => expect(result.current.isSynced).toBe(true))
        unmount()
        applyRemote.mockClear()

        act(() => {
            mapOf(doc).set('choice', 'after')
        })

        expect(applyRemote).not.toHaveBeenCalled()
    })

    it('stays idle while disabled, and without a provider', () => {
        const doc = new Y.Doc()
        const provider = createFakeYjsProvider(doc)
        const disabled = setup({ provider, enabled: false })

        act(() => provider.triggerSynced())
        expect(disabled.result.current.isSynced).toBe(false)

        const { result } = setup({ provider: null })
        expect(result.current.isSynced).toBe(false)
        expect(result.current.map).toBeNull()
    })
})
