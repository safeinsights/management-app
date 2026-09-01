import 'dotenv/config' // must precede other imports, matching Next.js
import { beforeAll, beforeEach, afterEach, afterAll, vi, Mock, expect } from 'vitest'
import { testTransaction } from 'pg-transactional-tests'
import { localStorageContext } from '@/server/actions/action'
import { createTempDir } from '@/tests/temp-dir'
import fs from 'fs'
import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/nextjs'
import { cleanup } from '@testing-library/react'

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'
import * as matchers from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interface Assertion<T = any> extends jest.Matchers<void, T>, TestingLibraryMatchers<T, void> {}
}

expect.extend(matchers)

// `after()` callbacks must be awaited before the test transaction rolls back, or they outlive
// it and cause speed-dependent FK violations (passing locally, failing on slow CI).
const mockState = vi.hoisted(() => {
    const headers = new Map()
    const pendingDeferredCallbacks: Promise<unknown>[] = []
    let runWithLocalStorage: ((cb: () => void) => void) | undefined

    return {
        headers,
        pendingDeferredCallbacks,
        setRunWithLocalStorage(run: (cb: () => void) => void) {
            runWithLocalStorage = run
        },
        runDeferredTestCallback(cb: () => void | Promise<void>) {
            if (!runWithLocalStorage) throw new Error('Test local storage context is not initialized')

            runWithLocalStorage(() => {
                const result = cb()
                if (result && typeof (result as Promise<unknown>).then === 'function') {
                    pendingDeferredCallbacks.push(result as Promise<unknown>)
                }
            })
        },
    }
})

mockState.setRunWithLocalStorage((cb) => {
    localStorageContext.run({ db: undefined as never }, cb)
})

// Deferred side effects must land before a test continues — e.g. a deferred CODE-SCANNED insert
// must commit before the next status change, or the time-ordered v7 ids invert.
// Snapshot-then-clear is deliberate: callbacks scheduled during the drain stay queued for
// afterEach instead of being dropped. Relies on runDeferredTestCallback pushing the promise
// synchronously; if that ever became async, this would snapshot empty and silently no-op.
export async function flushDeferred() {
    const toRun = mockState.pendingDeferredCallbacks.slice()
    mockState.pendingDeferredCallbacks.length = 0
    await Promise.allSettled(toRun)
}

// Vitest hoists vi.mock above imports, so factory-referenced values must come from vi.hoisted.

// eslint-disable-next-line @typescript-eslint/no-require-imports
vi.mock('next/router', () => require('next-router-mock'))
vi.mock('next/server', async (importOriginal) => ({
    ...(await importOriginal()),
    after: mockState.runDeferredTestCallback,
}))

// https://github.com/scottrippey/next-router-mock/issues/67#issuecomment-1564906960
vi.mock('next/navigation', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mockRouter = require('next-router-mock')
    const useRouter = mockRouter.useRouter

    return {
        ...mockRouter,
        notFound: vi.fn(),
        redirect: vi.fn().mockImplementation((url: string) => {
            mockRouter.memoryRouter.setCurrentUrl(url)
        }),
        usePathname: () => {
            const router = useRouter()
            return router.asPath.split('?')[0]
        },
        useParams: vi.fn(() => ({})),
        useSearchParams: () => {
            const router = useRouter()
            const path = router.query
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return new URLSearchParams(path as any)
        },
    }
})
vi.mock('next/cache')
vi.mock('next/font/google', () => ({
    Open_Sans: () => ({ className: '' }),
}))
vi.mock('next/headers', async () => ({ headers: async () => mockState.headers }))

// Configured via mockClerkSession() in unit.helpers.tsx
vi.mock('@clerk/nextjs')
vi.mock('@clerk/nextjs/server')

// Mutations only; read functions stay real.
vi.mock('@/server/clerk', async (importOriginal) => ({
    ...(await importOriginal()),
    updateClerkUserName: vi.fn(),
    updateClerkUserMetadata: vi.fn(),
    findOrCreateClerkOrganization: vi.fn(),
}))

vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
        hide: vi.fn(),
    },
    showNotification: vi.fn(),
    Notifications: () => null,
}))

// Stubs the Hocuspocus client so unit tests open no real websockets.
vi.mock('@hocuspocus/provider', async () => {
    const Y = await import('yjs')
    const websocketCtorSpy = vi.fn()
    const websocketInstances: FakeHocuspocusProviderWebsocket[] = []
    class FakeHocuspocusProviderWebsocket {
        providerMap = new Map()
        // Already connected so the editor renders without each test wiring up a status sequence.
        status: 'connecting' | 'connected' | 'disconnected' = 'connected'
        _observers = new Map<string, Set<(...args: unknown[]) => void>>()
        destroy = vi.fn()
        attach = vi.fn()
        detach = vi.fn()
        on(event: string, fn: (...args: unknown[]) => void) {
            if (!this._observers.has(event)) this._observers.set(event, new Set())
            this._observers.get(event)!.add(fn)
        }
        off(event: string, fn: (...args: unknown[]) => void) {
            this._observers.get(event)?.delete(fn)
        }
        __emit(event: string, ...args: unknown[]) {
            this._observers.get(event)?.forEach((fn) => fn(...args))
        }
        constructor(...args: unknown[]) {
            websocketCtorSpy(...args)
            websocketInstances.push(this)
        }
        static __ctor = websocketCtorSpy
        static __instances = websocketInstances
    }
    class FakeAwareness {
        clientID = 1
        states = new Map<number, Record<string, unknown>>()
        meta = new Map()
        _localState: Record<string, unknown> | null = null
        _observers = new Map<string, Set<(...args: unknown[]) => void>>()
        getStates() {
            return this.states
        }
        getLocalState() {
            return this._localState
        }
        setLocalState(state: Record<string, unknown> | null) {
            this._localState = state
            if (state) this.states.set(this.clientID, state)
            else this.states.delete(this.clientID)
            this._emit('change', [{ added: [], updated: [this.clientID], removed: [] }, 'local'])
            this._emit('update', [{ added: [], updated: [this.clientID], removed: [] }, 'local'])
        }
        setLocalStateField(field: string, value: unknown) {
            this.setLocalState({ ...(this._localState ?? {}), [field]: value })
        }
        on(event: string, fn: (...args: unknown[]) => void) {
            if (!this._observers.has(event)) this._observers.set(event, new Set())
            this._observers.get(event)!.add(fn)
        }
        off(event: string, fn: (...args: unknown[]) => void) {
            this._observers.get(event)?.delete(fn)
        }
        _emit(event: string, args: unknown[]) {
            this._observers.get(event)?.forEach((fn) => fn(...args))
        }
        destroy() {}
    }
    const providerCtorSpy = vi.fn()
    const providerInstances: FakeHocuspocusProvider[] = []
    class FakeHocuspocusProvider {
        document: InstanceType<typeof Y.Doc>
        awareness = new FakeAwareness()
        isSynced = false
        unsyncedChanges = 0
        configuration: { name?: string } = {}
        attach = vi.fn()
        detach = vi.fn()
        destroy = vi.fn()
        disconnect = vi.fn()
        connect = vi.fn()
        send = vi.fn()
        sendStateless = vi.fn()
        _observers = new Map<string, Set<(...args: unknown[]) => void>>()
        on(event: string, fn: (...args: unknown[]) => void) {
            if (!this._observers.has(event)) this._observers.set(event, new Set())
            this._observers.get(event)!.add(fn)
        }
        off(event: string, fn: (...args: unknown[]) => void) {
            this._observers.get(event)?.delete(fn)
        }
        // Test helper, matching the websocket fake above: a real emitter rather than a no-op spy,
        // because the provider's own lifecycle events are the only way a test can move a surface's
        // save status off idle. Nothing emits on its own, so a test that ignores this sees the same
        // inert provider as before.
        __emit(event: string, ...args: unknown[]) {
            this._observers.get(event)?.forEach((fn) => fn(...args))
        }
        constructor(opts?: { document?: InstanceType<typeof Y.Doc>; name?: string }) {
            this.document = opts?.document ?? new Y.Doc()
            this.configuration = { name: opts?.name }
            providerCtorSpy(opts)
            providerInstances.push(this)
        }
        static __ctor = providerCtorSpy
        static __instances = providerInstances
    }
    return {
        HocuspocusProviderWebsocket: FakeHocuspocusProviderWebsocket,
        HocuspocusProvider: FakeHocuspocusProvider,
        WebSocketStatus: {
            Connecting: 'connecting',
            Connected: 'connected',
            Disconnected: 'disconnected',
        },
    }
})

// Instant sleep keeps deferred simulation callbacks inside the test transaction instead of
// firing real 1s/30s timers.
vi.mock('@/lib/utils', async (importOriginal) => ({
    ...(await importOriginal()),
    sleep: vi.fn().mockResolvedValue(undefined),
}))

beforeAll(async () => {
    // Defense in depth: prevents real API calls should the Clerk mocks fail.
    delete process.env.CLERK_SECRET_KEY
    delete process.env.CLERK_PUBLISHABLE_KEY
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

    testTransaction.start()
})

let tmpDir: string = ''

beforeEach(async () => {
    testTransaction.start()
    tmpDir = await createTempDir()
    process.env.UPLOAD_TMP_DIRECTORY = tmpDir
    ;(useClerk as Mock).mockImplementation(() => ({
        signOut: vi.fn(),
        openUserProfile: vi.fn(),
    }))
    ;(useAuth as Mock).mockReturnValue({ userId: null, isLoaded: true })
    ;(useUser as Mock).mockReturnValue({ user: null, isLoaded: false, isSignedIn: false })
    ;(ClerkProvider as Mock).mockImplementation(({ children }: { children: React.ReactNode }) => {
        return children
    })
})

afterEach(async () => {
    mockState.headers.clear()
    await Promise.allSettled(mockState.pendingDeferredCallbacks)
    mockState.pendingDeferredCallbacks.length = 0
    await testTransaction.rollback()
    await fs.promises.rm(tmpDir, { recursive: true })
    delete process.env.UPLOAD_TMP_DIRECTORY
    const { __resetSharedYjsWebsocketForTests } = await import('@/lib/realtime/yjs-websocket-context')
    __resetSharedYjsWebsocketForTests()
    // Unmount before clearing the clients, or a surviving refetchInterval observer carries
    // in-flight state into the next test.
    cleanup()
    const { resetTestQueryClients } = await import('@/tests/unit.helpers')
    resetTestQueryClients()
})

afterAll(async () => {
    await testTransaction.close()
})
