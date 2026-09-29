'use client'

import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from 'react'
import { HocuspocusProviderWebsocket, WebSocketStatus } from '@hocuspocus/provider'

import { WS_URL } from '@/lib/config'

export type ConnectionPhase = 'initial' | 'connected' | 'reconnecting' | 'failed'

type ConnectionState = {
    socket: HocuspocusProviderWebsocket | null
    phase: ConnectionPhase
    // Sourced from a server-read env var: the app build is shared across environments, so it
    // cannot be a build-time flag.
    singleUserEditing: boolean
}

const YjsWebsocketContext = createContext<ConnectionState>({
    socket: null,
    phase: 'initial',
    singleUserEditing: false,
})

// One per browser tab, module-scoped so Strict Mode double-mounts and client-side navigation reuse
// it. Destroyed on `pagehide` so a bfcache-restored page can open a fresh connection.
let sharedSocket: HocuspocusProviderWebsocket | null = null

// Notified when the singleton is replaced on `pageshow` after a bfcache restore, where React
// state still points at the socket `pagehide` destroyed.
const socketSubscribers = new Set<(socket: HocuspocusProviderWebsocket) => void>()

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
    window.addEventListener('pageshow', (event) => {
        if (!(event as PageTransitionEvent).persisted) return
        const next = getOrCreateSharedSocket()
        socketSubscribers.forEach((notify) => notify(next))
    })
}

export function __resetSharedYjsWebsocketForTests(): void {
    sharedSocket?.destroy()
    sharedSocket = null
    socketSubscribers.clear()
    const ctor = HocuspocusProviderWebsocket as unknown as { __instances?: unknown[] }
    if (ctor.__instances) ctor.__instances.length = 0
}

type Props = {
    children: ReactNode
    singleUserEditing?: boolean
    // Shorter values false-fire on tab-switches and Hocuspocus' own reconnect heartbeat.
    reconnectingThresholdMs?: number
    // The default leaves Hocuspocus' exponential backoff room to recover.
    failureThresholdMs?: number
}

const DEFAULT_RECONNECTING_THRESHOLD_MS = 30_000
const DEFAULT_FAILURE_THRESHOLD_MS = 5 * 60_000

export const YjsWebsocketProvider: FC<Props> = ({
    children,
    singleUserEditing = false,
    reconnectingThresholdMs = DEFAULT_RECONNECTING_THRESHOLD_MS,
    failureThresholdMs = DEFAULT_FAILURE_THRESHOLD_MS,
}) => {
    // Starts null even on the client's first render: creating the socket in the initializer
    // would diverge from the server-rendered skeleton and break hydration.
    const [socket, setSocket] = useState<HocuspocusProviderWebsocket | null>(null)
    const [phase, setPhase] = useState<ConnectionPhase>('initial')

    useEffect(() => {
        if (singleUserEditing) return undefined
        // Deferring socket creation to this effect is what keeps the first client render
        // matching the server-rendered skeleton.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSocket(getOrCreateSharedSocket())
        const onSocketReplaced = (next: HocuspocusProviderWebsocket) => {
            setSocket(next)
            setPhase('initial')
        }
        socketSubscribers.add(onSocketReplaced)
        return () => {
            socketSubscribers.delete(onSocketReplaced)
        }
    }, [singleUserEditing])

    useEffect(() => {
        if (!socket) return undefined

        let reconnectingTimer: ReturnType<typeof setTimeout> | null = null
        let failureTimer: ReturnType<typeof setTimeout> | null = null
        // Distinguishes "initial" (never connected) from "reconnecting" (was connected).
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

            // Hocuspocus alternates between connecting and disconnected during a normal
            // backoff reconnect, so the transition is scheduled rather than immediate.
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
        // Hocuspocus may already be connected when this effect runs (HMR, route change), and
        // without seeding the phase would stay 'initial' until the next status emit.
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

    return (
        <YjsWebsocketContext.Provider value={{ socket, phase, singleUserEditing }}>
            {children}
        </YjsWebsocketContext.Provider>
    )
}

// Per-document providers multiplex over this one connection via .attach()/.detach().
export function useYjsWebsocket(): HocuspocusProviderWebsocket | null {
    return useContext(YjsWebsocketContext).socket
}

// `initial` never connected; `connected` live; `reconnecting` lost transport but Yjs holds local
// edits so editors stay editable; `failed` down long enough to show a refresh prompt.
export function useConnectionPhase(): ConnectionPhase {
    return useContext(YjsWebsocketContext).phase
}

export function useSingleUserEditing(): boolean {
    return useContext(YjsWebsocketContext).singleUserEditing
}
