import { vi } from 'vitest'
import * as Y from 'yjs'

type Listener = (...args: unknown[]) => void

type CreateHocuspocusMockOptions = {
    withYDoc?: boolean
}

export type HocuspocusProviderHandle = {
    name?: string
    document?: Y.Doc
    triggerSync: () => void
    sendStateless: ReturnType<typeof vi.fn>
}

export const createHocuspocusMock = ({ withYDoc = false }: CreateHocuspocusMockOptions = {}) => {
    const constructed: HocuspocusProviderHandle[] = []

    class HocuspocusProvider {
        document?: Y.Doc
        isSynced = false
        synced = false
        sendStateless = vi.fn()
        private attached = false
        private syncListeners: Listener[] = []

        constructor(opts?: { document?: Y.Doc; name?: string }) {
            this.document = opts?.document ?? (withYDoc ? new Y.Doc() : undefined)
            constructed.push({
                name: opts?.name,
                document: this.document,
                triggerSync: () => {
                    if (withYDoc && !this.attached)
                        throw new Error('HocuspocusProvider must be attached before syncing')
                    this.isSynced = true
                    this.synced = true
                    this.syncListeners.forEach((fn) => fn())
                },
                sendStateless: this.sendStateless,
            })
        }
        attach() {
            this.attached = true
        }
        on(event: string, fn: Listener) {
            if (event === 'synced') this.syncListeners.push(fn)
        }
        off(event: string, fn: Listener) {
            if (event === 'synced') this.syncListeners = this.syncListeners.filter((l) => l !== fn)
        }
        destroy() {}
    }

    class HocuspocusProviderWebsocket {
        constructor(_opts?: unknown) {}
        destroy() {}
    }

    return {
        HocuspocusProvider,
        HocuspocusProviderWebsocket,
        __constructed: constructed,
    }
}
