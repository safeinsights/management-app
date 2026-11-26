// Relays the app's study change events (Postgres NOTIFY on STUDY_EVENTS_CHANNEL) to the per-study
// `study-events-<id>` documents. Pure so it can be tested without a server or a database;
// server.ts wires it to the pool and to Hocuspocus.

import {
    parseStudyEvent,
    STUDY_EVENTS_CHANNEL,
    STUDY_EVENTS_PREFIX,
    studyEventsDocName,
    UUID_RE,
} from '../../src/lib/collaboration-documents.ts'

export const LISTEN_RETRY_BASE_MS = 1_000
export const LISTEN_RETRY_MAX_MS = 30_000

// The part of a pg PoolClient the listener uses.
export type ListenClient = {
    query(text: string): Promise<unknown>
    on(event: 'notification', listener: (message: { channel: string; payload?: string }) => void): unknown
    on(event: 'error' | 'end', listener: (err?: Error) => void): unknown
    release(destroy: boolean): void
}

export type BroadcastTarget = { broadcastStateless(payload: string): void }

type ListenerDeps = {
    connect: () => Promise<ListenClient>
    onEvent: (payload: string) => void
    // Called after each successful LISTEN, the first one included.
    onListening: () => void
    log: (event: string, fields?: Record<string, unknown>) => void
    sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const messageOf = (err: unknown) => (err instanceof Error ? err.message : err === undefined ? undefined : String(err))

// Never throws: a lost or refused connection is retried with capped backoff, so a database outage
// cannot crash an editor that is already serving documents.
export function startStudyEventsListener({ connect, onEvent, onListening, log, sleep = wait }: ListenerDeps) {
    let stopped = false
    let attempt = 0
    let current: ListenClient | null = null

    const retry = async (): Promise<void> => {
        await sleep(Math.min(LISTEN_RETRY_BASE_MS * 2 ** attempt, LISTEN_RETRY_MAX_MS))
        attempt++
        return listen()
    }

    const listen = async (): Promise<void> => {
        if (stopped) return
        let client: ListenClient
        try {
            client = await connect()
        } catch (err) {
            log('study-events.listen.lost', { message: messageOf(err) })
            return retry()
        }
        current = client

        // pg emits 'error' and then 'end' for one drop, and release(true) ends the client again:
        // only the first signal may start a new connection.
        let lost = false
        const onLost = (err?: unknown) => {
            if (lost) return
            lost = true
            current = null
            client.release(true)
            log('study-events.listen.lost', { message: messageOf(err) })
            if (!stopped) void retry()
        }
        client.on('notification', ({ channel, payload }) => {
            if (channel === STUDY_EVENTS_CHANNEL && payload) onEvent(payload)
        })
        client.on('error', onLost)
        client.on('end', () => onLost())

        try {
            await client.query(`LISTEN ${STUDY_EVENTS_CHANNEL}`)
        } catch (err) {
            onLost(err)
            return
        }
        attempt = 0
        log('study-events.listen.ok')
        onListening()
    }

    void listen()

    return {
        stop() {
            stopped = true
            current?.release(true)
            current = null
        },
    }
}

// Only a study with an open page has its document loaded, so idle studies cost the editor nothing.
export function relayStudyEvent(payload: string, documents: Map<string, BroadcastTarget>): void {
    const event = parseStudyEvent(payload)
    if (!event || event.change === 'resync') return
    documents.get(studyEventsDocName(event.studyId))?.broadcastStateless(JSON.stringify(event))
}

// Events sent while the LISTEN connection was down are gone, so every open study page is told to
// re-read its data.
export function broadcastResync(documents: Map<string, BroadcastTarget>): void {
    for (const [name, document] of documents) {
        if (!name.startsWith(STUDY_EVENTS_PREFIX)) continue
        const studyId = name.slice(STUDY_EVENTS_PREFIX.length)
        if (!UUID_RE.test(studyId)) continue
        document.broadcastStateless(JSON.stringify({ type: 'study-changed', studyId, change: 'resync' }))
    }
}
