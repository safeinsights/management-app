'use client'

import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from 'react'
import { HocuspocusProviderWebsocket, WebSocketStatus } from '@hocuspocus/provider'

import { WS_URL } from '@/lib/config'

/** Coarse connection phase exposed to consumers. See useEditorConnection for details. */
export type ConnectionPhase = 'initial' | 'connected' | 'reconnecting' | 'failed'

type ConnectionState = {
    socket: HocuspocusProviderWebsocket | null
    phase: ConnectionPhase
}

const YjsWebsocketContext = createContext<ConnectionState>({ socket: null, phase: 'initial' })

// Module-scoped so the websocket is reused across React Strict Mode double-mounts
// in dev and across any client-side navigation that re-renders the provider tree.
// One per browser tab — cleaned up on `pagehide` so a bfcache-restored page can
// open a fresh connection if the old one is unusable.
let sharedSocket: HocuspocusProviderWebsocket | null = null

function getOrCreateSharedSocket(): HocuspocusProviderWebsocket {
    if (sharedSocket) return sharedSocket
    sharedSocket = new HocuspocusProviderWebsocket({ url: WS_URL })
    return sharedSocket
}

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
        sharedSocket?.destroy()
        sharedSocket = null
    })
}

/** Test-only: drop the cached socket so each test gets a fresh constructor call. */
export function __resetSharedYjsWebsocketForTests(): void {
    sharedSocket?.destroy()
    sharedSocket = null
    // Also clear the test mock's instance log if present so per-test
    // `ctorSpy.mock.instances` lookups stay isolated.
    const ctor = HocuspocusProviderWebsocket as unknown as { __instances?: unknown[] }
    if (ctor.__instances) ctor.__instances.length = 0
}

type Props = {
    children: ReactNode
    /**
     * How long the websocket can stay disconnected before we surface a "Reconnecting…"
     * banner to users. Anything shorter false-fires on routine browser tab-switches
     * and Hocuspocus' own messageReconnectTimeout heartbeat. 30s matches the default
     * reconnect timeout and is the smallest value that doesn't flap during normal use.
     */
    reconnectingThresholdMs?: number
    /**
     * After this many consecutive disconnect events without a successful reconnect we
     * surface the "failed" terminal state. The default leaves Hocuspocus' built-in
     * exponential backoff plenty of room (~5 minutes) before we tell the user the
     * editor is unavailable.
     */
    failureThresholdMs?: number
}

const DEFAULT_RECONNECTING_THRESHOLD_MS = 30_000
const DEFAULT_FAILURE_THRESHOLD_MS = 5 * 60_000

export const YjsWebsocketProvider: FC<Props> = ({
    children,
    reconnectingThresholdMs = DEFAULT_RECONNECTING_THRESHOLD_MS,
    failureThresholdMs = DEFAULT_FAILURE_THRESHOLD_MS,
}) => {
    const [socket] = useState<HocuspocusProviderWebsocket | null>(() =>
        typeof window === 'undefined' ? null : getOrCreateSharedSocket(),
    )
    const [phase, setPhase] = useState<ConnectionPhase>('initial')

    useEffect(() => {
        if (!socket) return undefined

        let reconnectingTimer: ReturnType<typeof setTimeout> | null = null
        let failureTimer: ReturnType<typeof setTimeout> | null = null
        // Tracks whether we've ever successfully connected. Drives the difference
        // between "initial" (never connected — show skeleton) and "reconnecting"
        // (was connected, now isn't — keep editing locally, show banner).
        let hasEverConnected = false

        const clearTimers = () => {
            if (reconnectingTimer) clearTimeout(reconnectingTimer)
            if (failureTimer) clearTimeout(failureTimer)
            reconnectingTimer = null
            failureTimer = null
        }

        const onStatus = ({ status }: { status: WebSocketStatus }) => {
            if (status === WebSocketStatus.Connected) {
                clearTimers()
                hasEverConnected = true
                setPhase('connected')
                return
            }

            // Connecting / Disconnected: schedule the surface transitions but don't
            // jump there immediately. Hocuspocus alternates between connecting and
            // disconnected during normal reconnect with backoff, and a one-second
            // hop shouldn't disturb the user.
            if (reconnectingTimer === null) {
                reconnectingTimer = setTimeout(() => {
                    setPhase((prev) => {
                        if (prev === 'connected' || prev === 'initial') {
                            return hasEverConnected ? 'reconnecting' : 'initial'
                        }
                        return prev
                    })
                }, reconnectingThresholdMs)
            }
            if (failureTimer === null) {
                failureTimer = setTimeout(() => {
                    setPhase('failed')
                }, failureThresholdMs)
            }
        }

        socket.on('status', onStatus)
        // Seed phase from the socket's current status — Hocuspocus may already be
        // connected by the time this effect runs (HMR, route change). Without
        // seeding we'd stay at 'initial' until the next status emit.
        if (socket.status === WebSocketStatus.Connected) {
            hasEverConnected = true
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPhase('connected')
        } else {
            onStatus({ status: socket.status })
        }

        return () => {
            socket.off('status', onStatus)
            clearTimers()
        }
    }, [socket, reconnectingThresholdMs, failureThresholdMs])

    return <YjsWebsocketContext.Provider value={{ socket, phase }}>{children}</YjsWebsocketContext.Provider>
}

/**
 * Returns the tab-singleton Hocuspocus websocket. Null only during SSR or before
 * the provider mounts. Per-document HocuspocusProvider instances multiplex over
 * this single connection via .attach()/.detach(), and authenticate per-document
 * at handshake time.
 */
export function useYjsWebsocket(): HocuspocusProviderWebsocket | null {
    return useContext(YjsWebsocketContext).socket
}

/**
 * Returns the current coarse phase of the shared websocket connection:
 * - `initial` — never connected (cold start). Editors should render a skeleton.
 * - `connected` — healthy. Editors are live.
 * - `reconnecting` — was connected, lost transport for >30s. Yjs holds local edits;
 *   editors stay editable but a banner warns that changes haven't synced yet.
 * - `failed` — disconnected for >5 minutes. Editors are replaced with an unavailable
 *   message; the user should refresh.
 */
export function useConnectionPhase(): ConnectionPhase {
    return useContext(YjsWebsocketContext).phase
}
