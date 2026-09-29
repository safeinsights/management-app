import { HocuspocusProvider } from '@hocuspocus/provider'
import { act, describe, expect, it, renderHook } from '@/tests/unit.helpers'
import { type CollabFieldKey } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { collabFieldSaveStatus, useCollabFieldsSaveStatus } from './use-collab-fields-save-status'

const edited = (...keys: CollabFieldKey[]) => new Set<CollabFieldKey>(keys)

// The rule the two collaborative proposal surfaces share, on its own.
describe('collabFieldSaveStatus', () => {
    it('surfaces the provider status on a field the user has edited', () => {
        expect(collabFieldSaveStatus('saved', edited('title'), 'title', undefined)).toBe('saved')
    })

    it('passes "saving" through as well, so the field can report an in-flight save', () => {
        expect(collabFieldSaveStatus('saving', edited('title'), 'title', undefined)).toBe('saving')
    })

    // OTTER-594 QA: the provider status is form-wide, so without this gate every pristine field
    // would claim "All changes saved" the moment any other field saved.
    it('stays idle on a field the user has not edited', () => {
        expect(collabFieldSaveStatus('saved', edited('datasets'), 'title', undefined)).toBe('idle')
    })

    it('stays idle when nothing has been edited at all', () => {
        expect(collabFieldSaveStatus('saved', edited(), 'title', undefined)).toBe('idle')
    })

    // OTTER-674: the error takes the slot the indicator would occupy, so the two can never co-exist.
    it('stands down while the field carries a validation error', () => {
        expect(collabFieldSaveStatus('saved', edited('title'), 'title', 'This field is required.')).toBe('idle')
    })

    it('scopes the error gate to the field that holds it', () => {
        const editedKeys = edited('title', 'datasets')

        expect(collabFieldSaveStatus('saved', editedKeys, 'title', 'This field is required.')).toBe('idle')
        expect(collabFieldSaveStatus('saved', editedKeys, 'datasets', undefined)).toBe('saved')
    })

    it('reports idle while the provider itself is idle, however the field was left', () => {
        expect(collabFieldSaveStatus('idle', edited('piName'), 'piName', undefined)).toBe('idle')
    })
})

// The same rule bound to a provider, which is the half the pure function cannot show: that the
// hook subscribes to the provider's save lifecycle and re-renders its callers on it.
//
// Driven through the global `@hocuspocus/provider` fake (tests/vitest.setup.ts) and its `__emit`
// helper. That is the third-party provider: nothing of ours is stood in for, and happy-dom has no
// websocket to produce these events on its own.
describe('useCollabFieldsSaveStatus', () => {
    type FakeProvider = {
        isSynced: boolean
        unsyncedChanges: number
        __emit: (event: string, ...args: unknown[]) => void
    }

    const syncedProvider = () => {
        const provider = new HocuspocusProvider({} as never) as unknown as FakeProvider
        provider.isSynced = true
        return provider
    }

    const renderSaveStatusFor = (editedKeys: ReadonlySet<CollabFieldKey>) => {
        const provider = syncedProvider()
        const { result } = renderHook(() =>
            useCollabFieldsSaveStatus({ provider: provider as unknown as HocuspocusProvider, editedKeys }),
        )
        return { provider, result }
    }

    // A save as the provider reports one: unsynced changes appear, then settle.
    const reportSaveCycle = (provider: FakeProvider) => {
        act(() => {
            provider.unsyncedChanges = 1
            provider.__emit('unsyncedChanges')
        })
        act(() => {
            provider.unsyncedChanges = 0
            provider.__emit('unsyncedChanges')
        })
    }

    it('reports idle before any save', () => {
        const { result } = renderSaveStatusFor(edited('title'))

        expect(result.current('title', undefined)).toBe('idle')
    })

    it('surfaces the save on an edited field once the provider settles', () => {
        const { provider, result } = renderSaveStatusFor(edited('title'))

        reportSaveCycle(provider)

        expect(result.current('title', undefined)).toBe('saved')
    })

    it('reports the in-flight half of the same cycle', () => {
        const { provider, result } = renderSaveStatusFor(edited('title'))

        act(() => {
            provider.unsyncedChanges = 1
            provider.__emit('unsyncedChanges')
        })

        expect(result.current('title', undefined)).toBe('saving')
    })

    it('leaves a pristine field at idle through that same save', () => {
        const { provider, result } = renderSaveStatusFor(edited('title'))

        reportSaveCycle(provider)

        expect(result.current('datasets', undefined)).toBe('idle')
    })

    it('holds a null provider at idle however the fields were left', () => {
        const { result } = renderHook(() => useCollabFieldsSaveStatus({ provider: null, editedKeys: edited('title') }))

        expect(result.current('title', undefined)).toBe('idle')
    })

    // The reason this surface gates the status instead of hiding a mounted indicator with
    // `isVisible`: standing down does not discard the save. The provider's status is held in state
    // and the field stays edited, so the same render reports 'saved' again the moment the error
    // argument goes away.
    it('stands a field down for its own error only, and takes it back when the error clears', () => {
        const { provider, result } = renderSaveStatusFor(edited('title', 'datasets'))

        reportSaveCycle(provider)

        expect(result.current('title', 'This field is required.')).toBe('idle')
        expect(result.current('datasets', undefined)).toBe('saved')
        expect(result.current('title', undefined)).toBe('saved')
    })
})
