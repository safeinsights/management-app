import { db, describe, expect, insertTestStudyOnly, it } from '@/tests/unit.helpers'
import { getOrCreateCurrentRoundJob } from '@/server/db/mutations'
import { sql, type Kysely } from 'kysely'
import type { StudyJobStatus } from '@/database/types'
import { JOB_STATUSES, REPLAY_TIE_RANK, findTransition, replayEffect } from '@/lib/job-status-rules'
import { codeRoundForJob } from '@/server/db/code-round'
import { openStudyJob, recomputeJobStates, resolveJobState, writeJobStatus } from '@/database/job-status-writer'
import {
    BACKFILL_LOG_PAIRS,
    BACKFILL_ROUND_CLOSING_STATUSES,
    BACKFILL_TIE_RANK,
    backfillEffect,
    backfillStudyJobState,
} from './migrations/1787900000000_study_job_current_status'
import { CODE_ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'

const BASE = new Date('2026-01-01T00:00:00Z').getTime()
const at = (second: number) => new Date(BASE + second * 1000)

type History = StudyJobStatus[]

// Rows as an app version older than the status writer wrote them, one second apart.
const insertLegacyJob = async (studyId: string, history: History, { createdAt = at(0) } = {}) => {
    // eslint-disable-next-line custom/noJobStatusWrites -- builds pre-migration rows directly
    const job = await db.insertInto('studyJob').values({ studyId, createdAt }).returning('id').executeTakeFirstOrThrow()
    for (const [index, status] of history.entries()) {
        // eslint-disable-next-line custom/noJobStatusWrites -- builds pre-migration rows directly
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status, createdAt: at(index + 1) })
            .execute()
    }
    return job.id
}

const columnsOf = (jobId: string) =>
    db
        .selectFrom('studyJob')
        .select(['currentStatus', 'round', 'statusChangedAt'])
        .where('id', '=', jobId)
        .executeTakeFirstOrThrow()

const backfill = (jobIds: string[]) => backfillStudyJobState(db as unknown as Kysely<unknown>, { jobIds })

type Case = { name: string; history: History; status: StudyJobStatus; changedAtRow: number; round: number }

// changedAtRow is the 1-based position of the row the job's status came from.
const CASES: Case[] = [
    { name: 'a fresh job', history: ['INITIATED'], status: 'INITIATED', changedAtRow: 1, round: 1 },
    {
        name: 'submitted',
        history: ['INITIATED', 'CODE-SUBMITTED'],
        status: 'CODE-SUBMITTED',
        changedAtRow: 2,
        round: 1,
    },
    {
        name: 'scanned',
        history: ['INITIATED', 'CODE-SUBMITTED', 'CODE-SCANNED'],
        status: 'CODE-SCANNED',
        changedAtRow: 3,
        round: 1,
    },
    {
        name: 'changes requested',
        history: ['INITIATED', 'CODE-SUBMITTED', 'CODE-SCANNED', 'CODE-CHANGES-REQUESTED'],
        status: 'CODE-CHANGES-REQUESTED',
        changedAtRow: 4,
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
        name: 'approved',
        history: ['INITIATED', 'CODE-SUBMITTED', 'CODE-APPROVED'],
        status: 'CODE-APPROVED',
        changedAtRow: 3,
        round: 1,
    },
    {
        name: 'packaging',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-PACKAGING'],
        status: 'JOB-PACKAGING',
        changedAtRow: 3,
        round: 1,
    },
    {
        name: 'running',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-READY', 'JOB-RUNNING'],
        status: 'JOB-RUNNING',
        changedAtRow: 4,
        round: 1,
    },
    {
        name: 'errored after approval',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-READY', 'JOB-ERRORED'],
        status: 'JOB-ERRORED',
        changedAtRow: 4,
        round: 1,
    },
    {
        name: 'errored scan',
        history: ['CODE-SUBMITTED', 'JOB-ERRORED'],
        status: 'JOB-ERRORED',
        changedAtRow: 2,
        round: 1,
    },
    {
        name: 'run complete',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-READY', 'JOB-RUNNING', 'RUN-COMPLETE'],
        status: 'RUN-COMPLETE',
        changedAtRow: 5,
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
        name: 'RESULTS-VIEWED after the decision',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED', 'RESULTS-VIEWED'],
        status: 'FILES-APPROVED',
        changedAtRow: 4,
        round: 1,
    },
    {
        name: 'a late scan after approval',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'CODE-SCANNED'],
        status: 'CODE-APPROVED',
        changedAtRow: 2,
        round: 1,
    },
    {
        name: 'JOB-PROVISIONING after JOB-RUNNING',
        history: ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-READY', 'JOB-RUNNING', 'JOB-PROVISIONING'],
        status: 'JOB-RUNNING',
        changedAtRow: 4,
        round: 1,
    },
    {
        name: 'a legacy job with only JOB-READY',
        history: ['JOB-READY'],
        status: 'JOB-READY',
        changedAtRow: 1,
        round: 1,
    },
]

describe('backfillStudyJobState', () => {
    it.each(CASES)('stores the state of $name', async ({ history, status, changedAtRow, round }) => {
        const { study } = await insertTestStudyOnly()
        const jobId = await insertLegacyJob(study.id, history)

        await backfill([jobId])

        expect(await columnsOf(jobId)).toEqual({ currentStatus: status, round, statusChangedAt: at(changedAtRow) })
    })

    it('reads a job with no rows as INITIATED since the job was created', async () => {
        const { study } = await insertTestStudyOnly()
        const jobId = await insertLegacyJob(study.id, [], { createdAt: at(-5) })

        await backfill([jobId])

        expect(await columnsOf(jobId)).toEqual({ currentStatus: 'INITIATED', round: 1, statusChangedAt: at(-5) })
    })

    it('orders rows written in one transaction by lifecycle', async () => {
        const { study } = await insertTestStudyOnly()
        const jobId = await insertLegacyJob(study.id, [])
        // eslint-disable-next-line custom/noJobStatusWrites -- the tie only rows written under now() can have
        await db
            .insertInto('jobStatusChange')
            .values(
                (['JOB-READY', 'CODE-APPROVED', 'CODE-SUBMITTED'] as const).map((status) => ({
                    studyJobId: jobId,
                    status,
                    createdAt: at(1),
                })),
            )
            .execute()

        await backfill([jobId])

        expect((await columnsOf(jobId)).currentStatus).toBe('JOB-READY')
    })

    it('numbers the job after an outputs decision as the next round, and baseline jobs as round 1', async () => {
        const { study } = await insertTestStudyOnly()
        const decided = await insertLegacyJob(study.id, [
            'CODE-SUBMITTED',
            'CODE-APPROVED',
            'RUN-COMPLETE',
            'FILES-APPROVED',
        ])
        const next = await insertLegacyJob(study.id, ['INITIATED'], { createdAt: at(10) })
        const { study: other } = await insertTestStudyOnly()
        const baselines = [
            await insertLegacyJob(other.id, ['INITIATED']),
            await insertLegacyJob(other.id, ['INITIATED'], { createdAt: at(10) }),
        ]

        await backfill([decided, next, ...baselines])

        expect((await columnsOf(decided)).round).toBe(1)
        expect((await columnsOf(next)).round).toBe(2)
        expect(await Promise.all(baselines.map(async (id) => (await columnsOf(id)).round))).toEqual([1, 1])
    })
})

describe('pinned backfill rule', () => {
    it('logs exactly the pairs the runtime table logs', () => {
        for (const to of JOB_STATUSES) {
            for (const from of JOB_STATUSES) {
                const runtime = findTransition(from, to)?.effect === 'log'
                expect(BACKFILL_LOG_PAIRS[to]?.includes(from) ?? false, `${from} -> ${to}`).toBe(runtime)
            }
        }
    })

    it('gives every pair the effect the runtime replay gives it', () => {
        for (const to of JOB_STATUSES) {
            for (const from of JOB_STATUSES) {
                expect(backfillEffect(from, to), `${from} -> ${to}`).toBe(replayEffect(from, to))
            }
        }
    })

    it('breaks ties and counts rounds as the runtime does', () => {
        expect(BACKFILL_TIE_RANK).toEqual(REPLAY_TIE_RANK)
        expect(BACKFILL_ROUND_CLOSING_STATUSES).toEqual(CODE_ROUND_CLOSING_JOB_STATUSES)
    })
})

describe('the status writer keeps the columns', () => {
    const writeHistory = async (studyId: string, history: History) => {
        const job = await openStudyJob(db, studyId, { actor: 'qa', at: at(0) })
        for (const [index, status] of history.entries()) {
            await writeJobStatus(db, job.id, status, { actor: 'qa', at: at(index + 1) })
        }
        return job.id
    }

    it.each(CASES)('agrees with the backfill and codeRoundForJob for $name', async ({ history }) => {
        const { study } = await insertTestStudyOnly()
        const jobId = await writeHistory(study.id, history)
        const written = await columnsOf(jobId)

        await backfill([jobId])

        expect(await columnsOf(jobId)).toEqual(written)
        expect(written.round).toBe(await codeRoundForJob(jobId, db))
    })

    it('stores the round of a job opened after a decision', async () => {
        const { study } = await insertTestStudyOnly()
        await writeHistory(study.id, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-APPROVED'])
        await writeHistory(study.id, ['RUN-COMPLETE', 'FILES-REJECTED'])
        const next = await openStudyJob(db, study.id, { actor: 'qa' })

        expect(next.round).toBe(3)
        expect((await columnsOf(next.id)).round).toBe(await codeRoundForJob(next.id, db))
    })
})

// Migrations run before the code swap, so an older app version serves against these columns for a while.
describe('a job that older code touched during a deploy', () => {
    const staleJob = async () => {
        const { study } = await insertTestStudyOnly()
        const job = await openStudyJob(db, study.id, { actor: 'qa' })
        await writeJobStatus(db, job.id, 'CODE-SUBMITTED', { actor: 'qa' })
        // eslint-disable-next-line custom/noJobStatusWrites -- an older app version writes without the columns
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status: 'CODE-APPROVED', createdAt: sql<Date>`clock_timestamp()` })
            .execute()
        return { studyId: study.id, jobId: job.id }
    }

    it('gets the column defaults when it inserts a job', async () => {
        const { study } = await insertTestStudyOnly()
        const jobId = await insertLegacyJob(study.id, ['CODE-SUBMITTED'])

        expect(await columnsOf(jobId)).toMatchObject({ currentStatus: 'INITIATED', round: 1 })
    })

    it('leaves the columns stale until the next writer call, which repairs them even on a repeat', async () => {
        const { jobId } = await staleJob()
        expect((await columnsOf(jobId)).currentStatus).toBe('CODE-SUBMITTED')

        const result = await writeJobStatus(db, jobId, 'CODE-APPROVED', { actor: 'system' })

        expect(result.outcome).toBe('repeat')
        expect((await columnsOf(jobId)).currentStatus).toBe('CODE-APPROVED')
    })

    it('is repaired by resolveJobState', async () => {
        const { jobId } = await staleJob()

        expect(await resolveJobState(db, jobId)).toMatchObject({ status: 'CODE-APPROVED', repaired: true })
        expect((await columnsOf(jobId)).currentStatus).toBe('CODE-APPROVED')
    })

    it('is reported by a dry run of the recompute script and repaired by a real one', async () => {
        const { studyId, jobId } = await staleJob()

        expect(await recomputeJobStates(db, { studyId, dryRun: true })).toMatchObject([
            { jobId, status: 'CODE-APPROVED' },
        ])
        expect((await columnsOf(jobId)).currentStatus).toBe('CODE-SUBMITTED')

        await recomputeJobStates(db, { studyId })
        expect((await columnsOf(jobId)).currentStatus).toBe('CODE-APPROVED')
        expect(await recomputeJobStates(db, { studyId })).toEqual([])
    })

    it('opens the next round when a late scan followed the outputs decision', async () => {
        const { study } = await insertTestStudyOnly()
        const jobId = await insertLegacyJob(study.id, [
            'CODE-SUBMITTED',
            'CODE-APPROVED',
            'RUN-COMPLETE',
            'FILES-REJECTED',
        ])
        // eslint-disable-next-line custom/noJobStatusWrites -- an older scanner callback appended it
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: jobId, status: 'CODE-SCANNED', createdAt: sql<Date>`clock_timestamp()` })
            .execute()

        const next = await getOrCreateCurrentRoundJob(db, study.id)

        expect(next).toMatchObject({ created: true })
        expect((await columnsOf(jobId)).currentStatus).toBe('FILES-REJECTED')
    })
})
