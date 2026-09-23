import * as Y from 'yjs'

type Listener = () => void

export type FakeYjsProvider = ReturnType<typeof createFakeYjsProvider>

// Exposes a real Y.Doc so a test can drive the map the way a peer or the server would, and holds
// the sync back until `triggerSynced`, which is where the interesting races live.
export function createFakeYjsProvider(doc: Y.Doc) {
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
