import { renderHook, act, describe, it, expect } from '@/tests/unit.helpers'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { useActiveEditors } from './collaborative-editor'

type FakeAwareness = HocuspocusProvider['awareness'] & {
    states: Map<number, Record<string, unknown>>
    clientID: number
    _emit: (event: string, args: unknown[]) => void
}

function seedStates(awareness: FakeAwareness, entries: Array<[number, Record<string, unknown>]>) {
    for (const [clientId, state] of entries) {
        awareness.states.set(clientId, state)
    }
}

describe('useActiveEditors', () => {
    it('excludes the local Yjs client', () => {
        const provider = new HocuspocusProvider({ name: 'test' } as never)
        const awareness = provider.awareness as unknown as FakeAwareness
        awareness.clientID = 1
        seedStates(awareness, [
            [1, { name: 'Me', color: 'red', focusing: true, awarenessData: { userId: 'user-a' } }],
            [2, { name: 'Peer', color: 'blue', focusing: false, awarenessData: { userId: 'user-b' } }],
        ])

        const ref = { current: provider } as React.RefObject<HocuspocusProvider | null>
        const { result } = renderHook(() => useActiveEditors(ref, 'user-a'))

        expect(result.current).toHaveLength(1)
        expect(result.current[0].name).toBe('Peer')
    })

    it('excludes other tabs of the same Clerk user', () => {
        const provider = new HocuspocusProvider({ name: 'test' } as never)
        const awareness = provider.awareness as unknown as FakeAwareness
        awareness.clientID = 1
        seedStates(awareness, [
            [1, { name: 'Me', color: 'red', focusing: true, awarenessData: { userId: 'user-a' } }],
            [3, { name: 'Me (tab 2)', color: 'red', focusing: false, awarenessData: { userId: 'user-a' } }],
            [2, { name: 'Peer', color: 'blue', focusing: true, awarenessData: { userId: 'user-b' } }],
        ])

        const ref = { current: provider } as React.RefObject<HocuspocusProvider | null>
        const { result } = renderHook(() => useActiveEditors(ref, 'user-a'))

        expect(result.current).toHaveLength(1)
        expect(result.current[0].name).toBe('Peer')
    })

    it('deduplicates the same userId across tabs, preferring focusing', () => {
        const provider = new HocuspocusProvider({ name: 'test' } as never)
        const awareness = provider.awareness as unknown as FakeAwareness
        awareness.clientID = 1
        seedStates(awareness, [
            [2, { name: 'Peer', color: 'blue', focusing: false, awarenessData: { userId: 'user-b' } }],
            [3, { name: 'Peer', color: 'blue', focusing: true, awarenessData: { userId: 'user-b' } }],
        ])

        const ref = { current: provider } as React.RefObject<HocuspocusProvider | null>
        const { result } = renderHook(() => useActiveEditors(ref, 'user-a'))

        expect(result.current).toHaveLength(1)
        expect(result.current[0].focusing).toBe(true)
    })

    it('shows peers without userId individually using clientId fallback', () => {
        const provider = new HocuspocusProvider({ name: 'test' } as never)
        const awareness = provider.awareness as unknown as FakeAwareness
        awareness.clientID = 1
        seedStates(awareness, [
            [2, { name: 'Old Client A', color: 'green', focusing: false }],
            [3, { name: 'Old Client B', color: 'yellow', focusing: false }],
        ])

        const ref = { current: provider } as React.RefObject<HocuspocusProvider | null>
        const { result } = renderHook(() => useActiveEditors(ref, 'user-a'))

        expect(result.current).toHaveLength(2)
        expect(result.current.map((e) => e.name).sort()).toEqual(['Old Client A', 'Old Client B'])
    })

    it('excludes entries with no name', () => {
        const provider = new HocuspocusProvider({ name: 'test' } as never)
        const awareness = provider.awareness as unknown as FakeAwareness
        awareness.clientID = 1
        seedStates(awareness, [
            [2, { color: 'blue', focusing: false, awarenessData: { userId: 'user-b' } }],
            [3, { name: '', color: 'red', focusing: false, awarenessData: { userId: 'user-c' } }],
            [4, { name: 'Valid', color: 'green', focusing: true, awarenessData: { userId: 'user-d' } }],
        ])

        const ref = { current: provider } as React.RefObject<HocuspocusProvider | null>
        const { result } = renderHook(() => useActiveEditors(ref, 'user-a'))

        expect(result.current).toHaveLength(1)
        expect(result.current[0].name).toBe('Valid')
    })

    it('updates when awareness changes', () => {
        const provider = new HocuspocusProvider({ name: 'test' } as never)
        const awareness = provider.awareness as unknown as FakeAwareness
        awareness.clientID = 1

        const ref = { current: provider } as React.RefObject<HocuspocusProvider | null>
        const { result } = renderHook(() => useActiveEditors(ref, 'user-a'))

        expect(result.current).toHaveLength(0)

        act(() => {
            awareness.states.set(2, {
                name: 'Peer',
                color: 'blue',
                focusing: true,
                awarenessData: { userId: 'user-b' },
            })
            awareness._emit('change', [{ added: [2], updated: [], removed: [] }])
        })

        expect(result.current).toHaveLength(1)
        expect(result.current[0].name).toBe('Peer')
    })
})
