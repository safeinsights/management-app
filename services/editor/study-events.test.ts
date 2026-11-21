import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

import { broadcastResync, relayStudyEvent, startStudyEventsListener, type ListenClient } from './study-events.ts'

const STUDY_ID = '019ddb2a-5f38-74ea-b401-94fd79839071'
const OTHER_STUDY_ID = '019ddb2a-5f38-74ea-b401-94fd79839072'
const JOB_ID = '019ddb2a-5f38-74ea-b401-94fd798390ff'

class FakeClient extends EventEmitter {
    query = vi.fn(async (_text: string): Promise<unknown> => undefined)
    release = vi.fn()
}

const target = () => ({ broadcastStateless: vi.fn() })

// Resolves once the listener has had a chance to run its awaited steps.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const startWith = (clients: Array<FakeClient | Error>) => {
    const connect = vi.fn(async () => {
        const next = clients.shift()
        if (!next || next instanceof Error) throw next ?? new Error('no client left')
        return next as unknown as ListenClient
    })
    const onEvent = vi.fn()
    const onListening = vi.fn()
    const log = vi.fn()
    const listener = startStudyEventsListener({ connect, onEvent, onListening, log, sleep: async () => {} })
    return { connect, onEvent, onListening, log, listener }
}

describe('relayStudyEvent', () => {
    const event = { type: 'study-changed', studyId: STUDY_ID, change: 'job-status', jobId: JOB_ID }

    it('sends the event to the loaded document of its study only', () => {
        const mine = target()
        const other = target()
        const documents = new Map([
            [`study-events-${STUDY_ID}`, mine],
            [`study-events-${OTHER_STUDY_ID}`, other],
        ])

        relayStudyEvent(JSON.stringify(event), documents)

        expect(JSON.parse(mine.broadcastStateless.mock.calls[0][0])).toEqual(event)
        expect(other.broadcastStateless).not.toHaveBeenCalled()
    })

    it('drops invalid payloads and a resync, which only the editor may send', () => {
        const mine = target()
        const documents = new Map([[`study-events-${STUDY_ID}`, mine]])

        relayStudyEvent('not json', documents)
        relayStudyEvent(JSON.stringify({ ...event, studyId: 'nope' }), documents)
        relayStudyEvent(JSON.stringify({ ...event, change: 'resync' }), documents)

        expect(mine.broadcastStateless).not.toHaveBeenCalled()
    })

    it('sends nothing for a study with no open page', () => {
        expect(() => relayStudyEvent(JSON.stringify(event), new Map())).not.toThrow()
    })
})

describe('broadcastResync', () => {
    it('tells each loaded study-events document to resync, and no other document', () => {
        const events = target()
        const proposal = target()
        broadcastResync(
            new Map([
                [`study-events-${STUDY_ID}`, events],
                [`proposal-${STUDY_ID}-fields`, proposal],
            ]),
        )

        expect(events.broadcastStateless).toHaveBeenCalledOnce()
        expect(JSON.parse(events.broadcastStateless.mock.calls[0][0])).toEqual({
            type: 'study-changed',
            studyId: STUDY_ID,
            change: 'resync',
        })
        expect(proposal.broadcastStateless).not.toHaveBeenCalled()
    })
})

describe('startStudyEventsListener', () => {
    it('listens, passes on study events and reports that it is listening', async () => {
        const client = new FakeClient()
        const { onEvent, onListening, listener } = startWith([client])
        await settle()

        expect(client.query).toHaveBeenCalledWith('LISTEN study_events')
        expect(onListening).toHaveBeenCalledOnce()
        client.emit('notification', { channel: 'study_events', payload: '{"a":1}' })
        client.emit('notification', { channel: 'other', payload: '{"b":2}' })
        expect(onEvent).toHaveBeenCalledExactlyOnceWith('{"a":1}')
        listener.stop()
    })

    it('reconnects once and listens again when pg reports error and then end for one drop', async () => {
        const first = new FakeClient()
        const second = new FakeClient()
        const { connect, onListening, listener } = startWith([first, second])
        await settle()

        first.emit('error', new Error('Connection terminated unexpectedly'))
        first.emit('end')
        await settle()

        expect(first.release).toHaveBeenCalledExactlyOnceWith(true)
        expect(connect).toHaveBeenCalledTimes(2)
        expect(second.query).toHaveBeenCalledExactlyOnceWith('LISTEN study_events')
        expect(onListening).toHaveBeenCalledTimes(2)
        listener.stop()
    })

    it('retries a failing first connect instead of throwing', async () => {
        const client = new FakeClient()
        const { connect, onListening, listener } = startWith([new Error('database is starting'), client])
        await settle()
        await settle()

        expect(connect).toHaveBeenCalledTimes(2)
        expect(onListening).toHaveBeenCalledOnce()
        listener.stop()
    })

    it('releases a client whose LISTEN is refused, once, and retries once', async () => {
        const refused = new FakeClient()
        refused.query.mockRejectedValueOnce(new Error('LISTEN refused'))
        const next = new FakeClient()
        const { connect, onListening, listener } = startWith([refused, next])
        await settle()
        refused.emit('end')
        await settle()

        expect(refused.release).toHaveBeenCalledExactlyOnceWith(true)
        expect(connect).toHaveBeenCalledTimes(2)
        expect(onListening).toHaveBeenCalledOnce()
        listener.stop()
    })
})
