import { renderHook, act, describe, it, expect } from '@/tests/unit.helpers'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useProviderSaveStatus } from './use-provider-save-status'

type Listener = () => void

// Hand-rolled emitter provider: the global Hocuspocus mock stubs provider.on/off
// as no-op spies, so a real emitter is needed to drive unsyncedChanges/synced.
function createFakeProvider({ isSynced = true }: { isSynced?: boolean } = {}) {
    const listeners: Record<string, Set<Listener>> = {}
    return {
        isSynced,
        unsyncedChanges: 0,
        on(event: string, fn: Listener) {
            if (!listeners[event]) listeners[event] = new Set()
            listeners[event].add(fn)
        },
        off(event: string, fn: Listener) {
            listeners[event]?.delete(fn)
        },
        emit(event: string) {
            listeners[event]?.forEach((fn) => fn())
        },
    }
}

describe('useProviderSaveStatus', () => {
    it('returns idle for a null provider', () => {
        const { result } = renderHook(() => useProviderSaveStatus(null))
        expect(result.current).toBe('idle')
    })

    it('stays idle until a local edit, then reports saving and saved', () => {
        const provider = createFakeProvider()
        const { result } = renderHook(() => useProviderSaveStatus(provider as unknown as HocuspocusProvider))

        expect(result.current).toBe('idle')

        act(() => {
            provider.unsyncedChanges = 1
            provider.emit('unsyncedChanges')
        })
        expect(result.current).toBe('saving')

        act(() => {
            provider.unsyncedChanges = 0
            provider.emit('unsyncedChanges')
        })
        expect(result.current).toBe('saved')
    })

    it('ignores an unsynced settle that precedes any local edit', () => {
        const provider = createFakeProvider()
        const { result } = renderHook(() => useProviderSaveStatus(provider as unknown as HocuspocusProvider))

        act(() => {
            provider.unsyncedChanges = 0
            provider.emit('unsyncedChanges')
        })
        expect(result.current).toBe('idle')
    })

    it('waits for the initial sync before tracking edits', () => {
        const provider = createFakeProvider({ isSynced: false })
        const { result } = renderHook(() => useProviderSaveStatus(provider as unknown as HocuspocusProvider))

        act(() => {
            provider.unsyncedChanges = 1
            provider.emit('unsyncedChanges')
        })
        expect(result.current).toBe('idle')

        act(() => {
            provider.emit('synced')
        })
        act(() => {
            provider.unsyncedChanges = 1
            provider.emit('unsyncedChanges')
        })
        expect(result.current).toBe('saving')
    })

    it('resets to idle and re-arms the latch when the provider changes (reconnect)', () => {
        const providerA = createFakeProvider()
        const { result, rerender } = renderHook(
            ({ provider }) => useProviderSaveStatus(provider as unknown as HocuspocusProvider),
            { initialProps: { provider: providerA } },
        )

        act(() => {
            providerA.unsyncedChanges = 1
            providerA.emit('unsyncedChanges')
        })
        act(() => {
            providerA.unsyncedChanges = 0
            providerA.emit('unsyncedChanges')
        })
        expect(result.current).toBe('saved')

        // A websocket reconnect swaps in a fresh provider instance.
        const providerB = createFakeProvider()
        rerender({ provider: providerB })
        expect(result.current).toBe('idle')

        // The new provider settling with no local edit must not re-show "saved".
        act(() => {
            providerB.unsyncedChanges = 0
            providerB.emit('unsyncedChanges')
        })
        expect(result.current).toBe('idle')

        // A genuine edit on the new provider is still reported.
        act(() => {
            providerB.unsyncedChanges = 1
            providerB.emit('unsyncedChanges')
        })
        expect(result.current).toBe('saving')
    })
})
