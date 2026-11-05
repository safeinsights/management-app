import { db, describe, expect, insertTestStudyOnly, it } from '@/tests/unit.helpers'
import { getOrCreateCurrentRoundJob } from '@/server/db/mutations'
import { sql, type Kysely, type RawBuilder } from 'kysely'
import type { StudyJobStatus } from '@/database/types'
import { JOB_STATUSES } from '@/lib/job-status-rules'
import { openStudyJob } from '@/database/job-status-writer'
import {
    JOB_WRITER_FLAG,
    backfillEffect,
    backfillReplay,
    backfillStudyJobState,
    type BackfillRow,
} from './migrations/1793742916584_study_job_current_status'

const BASE = new Date('2026-01-01T00:00:00Z').getTime()
const at = (second: number) => new Date(BASE + second * 1000)

type History = StudyJobStatus[]

// Rows as an app version older than the status writer wrote them, without the job columns.
const insertLegacyStatus = async (
    studyJobId: string,
    status: StudyJobStatus,
    createdAt: Date | RawBuilder<Date> = sql<Date>`clock_timestamp()`,
) => {
    // eslint-disable-next-line custom/noJobStatusWrites -- builds pre-migration rows directly
    await db.insertInto('jobStatusChange').values({ studyJobId, status, createdAt }).execute()
}

// A whole job as older code wrote it, its rows one second apart.
const insertLegacyJob = async (studyId: string, history: History, { createdAt = at(0) } = {}) => {
    // eslint-disable-next-line custom/noJobStatusWrites -- builds pre-migration rows directly
    const job = await db.insertInto('studyJob').values({ studyId, createdAt }).returning('id').executeTakeFirstOrThrow()
    for (const [index, status] of history.entries()) {
        await insertLegacyStatus(job.id, status, at(index + 1))
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

describe('job_status_effect', () => {
    it('gives every pair the effect backfillEffect gives it', async () => {
        const pairs = JOB_STATUSES.flatMap((from) => JOB_STATUSES.map((to) => ({ from, to })))
        const { rows } = await sql<{ effect: string }>`
            SELECT job_status_effect(pair.from_status, pair.to_status) AS effect
            FROM unnest(${pairs.map(({ from }) => from)}::text[], ${pairs.map(({ to }) => to)}::text[])
                WITH ORDINALITY AS pair(from_status, to_status, position)
            ORDER BY pair.position
        `.execute(db)

        expect(rows.map((row) => row.effect)).toEqual(pairs.map(({ from, to }) => backfillEffect(from, to)))
    })
})

describe('backfillReplay', () => {
    const row = (status: StudyJobStatus, second: number, id: string = status): BackfillRow => ({
        id,
        status,
        micros: String(BigInt(at(second).getTime()) * BigInt(1000)),
    })
    const statusOf = (rows: BackfillRow[]) => backfillReplay(rows)?.status

    it('follows every move and ignores log rows', () => {
        const rows = (
            ['INITIATED', 'CODE-SUBMITTED', 'CODE-APPROVED', 'CODE-SCANNED', 'JOB-READY', 'JOB-RUNNING'] as const
        ).map((status, second) => row(status, second))
        expect(statusOf([...rows, row('JOB-PROVISIONING', 6)])).toBe('JOB-RUNNING')
    })

    it.each(['CODE-SCANNED', 'JOB-RUNNING', 'JOB-ERRORED', 'CODE-SUBMITTED', 'RESULTS-VIEWED'] as const)(
        'stays on the decision after a late %s',
        (late) => {
            expect(statusOf([row('RUN-COMPLETE', 0), row('FILES-REJECTED', 1), row(late, 2)])).toBe('FILES-REJECTED')
        },
    )

    it('ends on the later decision when qa wrote two', () => {
        expect(statusOf([row('RUN-COMPLETE', 0), row('FILES-APPROVED', 1), row('FILES-REJECTED', 2)])).toBe(
            'FILES-REJECTED',
        )
    })

    it('orders rows that tie by lifecycle, whatever order they arrive in', () => {
        const tied = [row('JOB-READY', 1, 'a'), row('CODE-APPROVED', 1, 'b'), row('CODE-SUBMITTED', 1, 'c')]
        for (const rows of [tied, [...tied].reverse(), [tied[1], tied[0], tied[2]]]) {
            expect(statusOf(rows)).toBe('JOB-READY')
        }
    })

    it('puts a resubmission after the change request it ties with', () => {
        expect(
            statusOf([row('CODE-SUBMITTED', 0), row('CODE-CHANGES-REQUESTED', 1), row('CODE-SUBMITTED', 1, 'second')]),
        ).toBe('CODE-SUBMITTED')
        expect(
            statusOf([
                row('CODE-SUBMITTED', 1, 'first'),
                row('CODE-CHANGES-REQUESTED', 1),
                row('CODE-SUBMITTED', 1, 'second'),
            ]),
        ).toBe('CODE-SUBMITTED')
    })

    it('puts a change request after the submission it ties with', () => {
        expect(statusOf([row('CODE-SUBMITTED', 1), row('CODE-CHANGES-REQUESTED', 1)])).toBe('CODE-CHANGES-REQUESTED')
    })

    it('starts from a legacy first row that is not INITIATED, and from nothing at all', () => {
        expect(statusOf([row('JOB-READY', 0)])).toBe('JOB-READY')
        expect(backfillReplay([])).toBeNull()
    })
})

// Migrations run before the code swap, so an older app version serves against these columns for a while.
describe('a job that older code touched between the migration and the code swap', () => {
    it.each(CASES)(
        'keeps the columns as the backfill would for $name',
        async ({ history, status, changedAtRow, round }) => {
            const { study } = await insertTestStudyOnly()
            const jobId = await insertLegacyJob(study.id, history)

            expect(await columnsOf(jobId)).toEqual({ currentStatus: status, round, statusChangedAt: at(changedAtRow) })
        },
    )

    it('numbers a job older code opens after a decided round', async () => {
        const { study } = await insertTestStudyOnly()
        await insertLegacyJob(study.id, ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED'])
        const next = await insertLegacyJob(study.id, ['INITIATED', 'CODE-SUBMITTED'], { createdAt: at(10) })

        expect(await columnsOf(next)).toMatchObject({ currentStatus: 'CODE-SUBMITTED', round: 2 })
    })

    it('opens the next round when a late scan followed the outputs decision', async () => {
        const { study } = await insertTestStudyOnly()
        const jobId = await insertLegacyJob(study.id, [
            'CODE-SUBMITTED',
            'CODE-APPROVED',
            'RUN-COMPLETE',
            'FILES-REJECTED',
        ])
        await insertLegacyStatus(jobId, 'CODE-SCANNED')

        const next = await getOrCreateCurrentRoundJob(db, study.id)

        expect(next).toMatchObject({ created: true })
        expect((await columnsOf(jobId)).currentStatus).toBe('FILES-REJECTED')
    })

    it('still applies a row from older code after a writer call in the same transaction', async () => {
        const { study } = await insertTestStudyOnly()
        const job = await openStudyJob(db, study.id, { actor: 'qa' })
        await insertLegacyStatus(job.id, 'CODE-SUBMITTED')

        expect((await columnsOf(job.id)).currentStatus).toBe('CODE-SUBMITTED')
    })

    it('leaves a row inserted under the writer flag to the writer', async () => {
        const { study } = await insertTestStudyOnly()
        const job = await openStudyJob(db, study.id, { actor: 'qa' })
        await sql`SELECT set_config(${JOB_WRITER_FLAG}, 'on', true)`.execute(db)
        await insertLegacyStatus(job.id, 'CODE-SUBMITTED')

        expect((await columnsOf(job.id)).currentStatus).toBe('INITIATED')
    })
})
