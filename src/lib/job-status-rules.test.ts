import { describe, expect, it } from '@/tests/unit.helpers'
import {
    decideJobTransition,
    findTransition,
    JOB_ACTORS,
    JOB_STATUSES,
    JOB_TRANSITIONS,
    type JobActor,
    type JobStatus,
} from './job-status-rules'

const decide = (
    from: JobStatus | null,
    to: JobStatus,
    actor: JobActor,
    history: { newestStatus?: JobStatus | null; has?: JobStatus[] } = {},
) =>
    decideJobTransition({
        from,
        to,
        actor,
        newestStatus: history.newestStatus ?? from,
        hasStatus: (status) => (history.has ?? []).includes(status),
    })

const write = (effect: 'move' | 'log', observed = false) => ({ kind: 'write', effect, observed })
const refused = (reason: string) => ({ kind: 'refused', reason })

describe('transition table', () => {
    it('lists each (from, to) pair at most once, so the effect of a pair is unambiguous', () => {
        const seen = new Set<string>()
        for (const row of JOB_TRANSITIONS) {
            for (const to of row.to) {
                for (const from of row.from) {
                    const key = `${from} -> ${to}`
                    expect(seen.has(key), key).toBe(false)
                    seen.add(key)
                }
            }
        }
    })

    it('permits every listed actor and refuses researcher, reviewer and system everywhere else', () => {
        for (const row of JOB_TRANSITIONS) {
            for (const to of row.to) {
                for (const from of row.from) {
                    if (from === to || from === 'FILES-APPROVED' || from === 'FILES-REJECTED') continue
                    for (const actor of JOB_ACTORS) {
                        const decision = decide(from, to, actor, { newestStatus: from })
                        if (row.actors.includes(actor) || actor === 'qa') {
                            expect(decision, `${actor}: ${from} -> ${to}`).toEqual(write(row.effect))
                        } else if (actor === 'enclave' || actor === 'service') {
                            expect(decision, `${actor}: ${from} -> ${to}`).toEqual(write(row.effect, true))
                        } else {
                            expect(decision, `${actor}: ${from} -> ${to}`).toEqual(refused('not-permitted'))
                        }
                    }
                }
            }
        }
    })

    it('marks only a resubmission after a change request as the next code round', () => {
        expect(findTransition('CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED')?.roundIncrement).toBe(true)
        expect(findTransition('INITIATED', 'CODE-SUBMITTED')?.roundIncrement).toBe(false)
    })

    it.each([
        ['CODE-CHANGES-REQUESTED', 'CODE-SCANNED', 'service'],
        ['CODE-APPROVED', 'CODE-SCANNED', 'system'],
        ['JOB-RUNNING', 'CODE-SCANNED', 'service'],
        ['CODE-CHANGES-REQUESTED', 'JOB-ERRORED', 'service'],
        ['JOB-RUNNING', 'JOB-PROVISIONING', 'enclave'],
        ['RUN-COMPLETE', 'JOB-RUNNING', 'enclave'],
        ['JOB-ERRORED', 'JOB-READY', 'service'],
        ['FILES-APPROVED', 'RESULTS-VIEWED', 'researcher'],
    ] as const)('logs %s -> %s from %s without moving the job', (from, to, actor) => {
        expect(decide(from, to, actor)).toEqual(write('log'))
    })
})

describe('decideJobTransition', () => {
    it('refuses FILES-REJECTED after FILES-APPROVED, whoever sends it', () => {
        for (const actor of ['reviewer', 'enclave', 'service', 'system', 'researcher'] as const) {
            expect(decide('FILES-APPROVED', 'FILES-REJECTED', actor)).toEqual(refused('round-closed'))
        }
    })

    it('refuses anything but RESULTS-VIEWED once the round is decided', () => {
        expect(decide('FILES-REJECTED', 'JOB-ERRORED', 'enclave')).toEqual(refused('round-closed'))
        expect(decide('FILES-APPROVED', 'CODE-SCANNED', 'service')).toEqual(refused('round-closed'))
        expect(decide('FILES-APPROVED', 'CODE-SUBMITTED', 'researcher')).toEqual(refused('round-closed'))
    })

    it('treats a repeat from the enclave, a service or the system as a no-op', () => {
        expect(decide('JOB-RUNNING', 'JOB-RUNNING', 'enclave')).toEqual({ kind: 'repeat' })
        expect(decide('JOB-ERRORED', 'JOB-ERRORED', 'service')).toEqual({ kind: 'repeat' })
        expect(decide('JOB-READY', 'JOB-READY', 'system')).toEqual({ kind: 'repeat' })
    })

    it('refuses a repeated outputs decision from any sender, because the round is closed', () => {
        for (const actor of ['reviewer', 'enclave', 'service', 'system'] as const) {
            expect(decide('FILES-APPROVED', 'FILES-APPROVED', actor)).toEqual(refused('round-closed'))
            expect(decide('FILES-REJECTED', 'FILES-REJECTED', actor)).toEqual(refused('round-closed'))
        }
    })

    it('refuses a repeat from a person, so the action rolls back', () => {
        expect(decide('CODE-SUBMITTED', 'CODE-SUBMITTED', 'researcher')).toEqual(refused('repeat'))
        expect(decide('CODE-APPROVED', 'CODE-APPROVED', 'reviewer')).toEqual(refused('repeat'))
    })

    it('skips a log row that the newest row already carries', () => {
        expect(decide('CODE-APPROVED', 'CODE-SCANNED', 'service', { newestStatus: 'CODE-SCANNED' })).toEqual({
            kind: 'noop',
        })
        expect(decide('CODE-APPROVED', 'CODE-SCANNED', 'service', { newestStatus: 'CODE-APPROVED' })).toEqual(
            write('log'),
        )
    })

    it('records RESULTS-VIEWED once per job', () => {
        expect(decide('FILES-APPROVED', 'RESULTS-VIEWED', 'researcher', { has: ['RESULTS-VIEWED'] })).toEqual({
            kind: 'noop',
        })
    })

    it('refuses an unlisted pair from a person or the system', () => {
        expect(decide('INITIATED', 'CODE-APPROVED', 'reviewer')).toEqual(refused('not-permitted'))
        expect(decide('INITIATED', 'CODE-SCANNED', 'system')).toEqual(refused('not-permitted'))
        expect(decide('CODE-SUBMITTED', 'CODE-REJECTED', 'reviewer')).toEqual(refused('not-permitted'))
    })

    it('writes an unlisted pair from the enclave or a service in observe mode', () => {
        expect(decide('INITIATED', 'JOB-RUNNING', 'enclave')).toEqual(write('move', true))
        expect(decide('CODE-SUBMITTED', 'JOB-PACKAGING', 'service')).toEqual(write('move', true))
    })

    it('lets qa write any pair, with the effect the table gives it', () => {
        for (const to of JOB_STATUSES) {
            expect(decide('FILES-APPROVED', to, 'qa').kind).toBe('write')
        }
        expect(decide('CODE-SUBMITTED', 'CODE-REJECTED', 'qa')).toEqual(write('move'))
        expect(decide('JOB-RUNNING', 'JOB-PROVISIONING', 'qa')).toEqual(write('log'))
        expect(decide('JOB-RUNNING', 'JOB-RUNNING', 'qa')).toEqual(write('log'))
        expect(decide('FILES-REJECTED', 'CODE-SCANNED', 'qa')).toEqual(write('log'))
        expect(decide('FILES-APPROVED', 'FILES-REJECTED', 'qa')).toEqual(write('move'))
    })
})
