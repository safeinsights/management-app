import { db, describe, expect, insertTestStudyOnly, it } from '@/tests/unit.helpers'
import type { JobStatus } from '@/lib/job-status-rules'
import { openStudyJob, writeJobStatus } from './job-status-writer'

// Expected values of the writer only: the backfill and trigger tests keep their own, because those
// pin the migration's frozen rule and a change to the transition table must not reach them.

const BASE = new Date('2026-01-01T00:00:00Z').getTime()
const at = (second: number) => new Date(BASE + second * 1000)

const columnsOf = (jobId: string) =>
    db
        .selectFrom('studyJob')
        .select(['currentStatus', 'round', 'statusChangedAt'])
        .where('id', '=', jobId)
        .executeTakeFirstOrThrow()

// Each status lands at the time of its 1-based position.
const writeHistory = async (studyId: string, history: JobStatus[], { createdAt }: { createdAt?: Date } = {}) => {
    const opensWithInitiated = history[0] === 'INITIATED'
    const job = await openStudyJob(db, studyId, { actor: 'qa', createdAt, at: at(opensWithInitiated ? 1 : 0) })
    for (const [index, status] of history.entries()) {
        if (index > 0 || !opensWithInitiated) {
            await writeJobStatus(db, job.id, status, { actor: 'qa', at: at(index + 1) })
        }
    }
    return job.id
}

type Case = { name: string; history: JobStatus[]; status: JobStatus; changedAtRow: number; round: number }

// changedAtRow is the 1-based position of the row the job's status came from.
const CASES: Case[] = [
    { name: 'a fresh job', history: ['INITIATED'], status: 'INITIATED', changedAtRow: 1, round: 1 },
    {
        name: 'scanned',
        history: ['INITIATED', 'CODE-SUBMITTED', 'CODE-SCANNED'],
        status: 'CODE-SCANNED',
        changedAtRow: 3,
        round: 1,
    },
    {
        name: 'changes requested',
        history: ['INITIATED', 'CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'],
        status: 'CODE-CHANGES-REQUESTED',
        changedAtRow: 3,
        round: 1,
    },
    {
        name: 'resubmitted on the same job',
        history: ['INITIATED', 'CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'],
        status: 'CODE-SUBMITTED',
        changedAtRow: 4,
        round: 2,
    },
    {
        name: 'resubmitted twice',
        history: [
            'CODE-SUBMITTED',
            'CODE-CHANGES-REQUESTED',
            'CODE-SUBMITTED',
            'CODE-CHANGES-REQUESTED',
            'CODE-SUBMITTED',
        ],
        status: 'CODE-SUBMITTED',
        changedAtRow: 5,
        round: 3,
    },
    {
        name: 'errored after approval',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-READY', 'JOB-ERRORED'],
        status: 'JOB-ERRORED',
        changedAtRow: 4,
        round: 1,
    },
    {
        name: 'outputs shared',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED'],
        status: 'FILES-APPROVED',
        changedAtRow: 4,
        round: 1,
    },
    {
        name: "QA's two decisions",
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED'],
        status: 'FILES-REJECTED',
        changedAtRow: 5,
        round: 1,
    },
    {
        name: 'a late scan after the outputs decision',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-REJECTED', 'CODE-SCANNED'],
        status: 'FILES-REJECTED',
        changedAtRow: 4,
        round: 1,
    },
    {
        name: 'a QA submission logged on a decided job',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED', 'CODE-SUBMITTED'],
        status: 'FILES-APPROVED',
        changedAtRow: 4,
        round: 1,
    },
    {
        name: 'JOB-PROVISIONING after JOB-RUNNING',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-READY', 'JOB-RUNNING', 'JOB-PROVISIONING'],
        status: 'JOB-RUNNING',
        changedAtRow: 4,
        round: 1,
    },
]

describe('the status writer keeps the columns', () => {
    it.each(CASES)('stores the state of $name', async ({ history, status, changedAtRow, round }) => {
        const { study } = await insertTestStudyOnly()
        const jobId = await writeHistory(study.id, history)

        expect(await columnsOf(jobId)).toEqual({ currentStatus: status, round, statusChangedAt: at(changedAtRow) })
    })
})

describe('openStudyJob', () => {
    it('numbers a job opened after an outputs decision as the next round', async () => {
        const { study } = await insertTestStudyOnly()
        await writeHistory(study.id, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-APPROVED'])
        await writeHistory(study.id, ['RUN-COMPLETE', 'FILES-REJECTED'])
        const next = await openStudyJob(db, study.id, { actor: 'qa' })

        expect(next.round).toBe(3)
        expect((await columnsOf(next.id)).round).toBe(3)
    })

    it('keeps the round of a latest job that is not decided', async () => {
        const { study } = await insertTestStudyOnly()
        await writeHistory(study.id, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'])

        expect((await openStudyJob(db, study.id, { actor: 'qa' })).round).toBe(1)
    })

    it('numbers from the highest stored round, whatever createdAt says', async () => {
        const { study } = await insertTestStudyOnly()
        await writeHistory(study.id, ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED'], {
            createdAt: at(10),
        })
        const backdated = await openStudyJob(db, study.id, { actor: 'qa', createdAt: at(-10) })

        expect(backdated.round).toBe(2)
    })
})
