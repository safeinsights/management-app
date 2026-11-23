import { vi } from 'vitest'
import { db } from '@/database'
import { sql } from 'kysely'
import type { StudyJobStatus } from '@/database/types'
import {
    describe,
    expect,
    insertTestJobStatuses,
    insertTestStudyJobData,
    insertTestUser,
    it,
} from '@/tests/unit.helpers'
import { flushDeferred } from '@/tests/vitest.setup'
import logger from '@/lib/logger'
import { sendDataPartnerCodeErroredEmail } from '@/server/mailer'
import { withTransaction } from '@/server/request-context'
import { JobTransitionRefusedError, transitionJob } from './job-transitions'

vi.mock('@/server/mailer', () => ({
    sendDataPartnerCodeErroredEmail: vi.fn(),
}))

const statusesOf = async (jobId: string) =>
    (
        await db
            .selectFrom('jobStatusChange')
            .select(['status', 'createdAt'])
            .where('studyJobId', '=', jobId)
            .orderBy('createdAt')
            .execute()
    ).map((row) => row.status)

const jobAt = async (statuses: StudyJobStatus[]) => {
    const { job, org } = await insertTestStudyJobData({ jobStatus: statuses[0] })
    await insertTestJobStatuses(job.id, statuses.slice(1))
    return { jobId: job.id, org }
}

describe('transitionJob', () => {
    it('refuses FILES-REJECTED after FILES-APPROVED and writes no row', async () => {
        const { jobId } = await jobAt(['RUN-COMPLETE', 'FILES-APPROVED'])
        const before = await statusesOf(jobId)

        await expect(transitionJob(db, jobId, 'FILES-REJECTED', { actor: 'reviewer' })).rejects.toBeInstanceOf(
            JobTransitionRefusedError,
        )
        expect(await statusesOf(jobId)).toEqual(before)
    })

    it('tells the person in plain words why the action was refused', async () => {
        const approved = await jobAt(['CODE-SUBMITTED', 'CODE-APPROVED'])
        const decided = await jobAt(['RUN-COMPLETE', 'FILES-APPROVED'])

        const repeat = await transitionJob(db, approved.jobId, 'CODE-APPROVED', { actor: 'reviewer' }).catch((e) => e)
        const other = await transitionJob(db, decided.jobId, 'FILES-REJECTED', { actor: 'reviewer' }).catch((e) => e)

        expect(repeat).toBeInstanceOf(JobTransitionRefusedError)
        expect(repeat.error).toEqual({ study: 'already has this status. Refresh to see the updated status.' })
        expect(other.error).toEqual({ study: 'has already been decided. Refresh to see the updated status.' })
    })

    it('rolls back the work its caller did in the same transaction when it refuses', async () => {
        const { jobId, org } = await jobAt(['RUN-COMPLETE', 'FILES-APPROVED'])
        const { user } = await insertTestUser({ org })

        await expect(
            withTransaction(db, async (trx) => {
                await trx.updateTable('user').set({ firstName: 'changed' }).where('id', '=', user.id).execute()
                await transitionJob(trx, jobId, 'FILES-REJECTED', { actor: 'reviewer' })
            }),
        ).rejects.toBeInstanceOf(JobTransitionRefusedError)

        const after = await db
            .selectFrom('user')
            .select('firstName')
            .where('id', '=', user.id)
            .executeTakeFirstOrThrow()
        expect(after.firstName).not.toBe('changed')
    })

    it('answers a repeat from the enclave without writing a row', async () => {
        const { jobId } = await jobAt(['CODE-APPROVED', 'JOB-READY', 'JOB-RUNNING'])
        const before = await statusesOf(jobId)

        const result = await transitionJob(db, jobId, 'JOB-RUNNING', { actor: 'enclave' })

        expect(result.outcome).toBe('repeat')
        expect(await statusesOf(jobId)).toEqual(before)
    })

    it('logs a late stage report without moving the job back', async () => {
        const { jobId } = await jobAt(['CODE-APPROVED', 'JOB-READY', 'JOB-RUNNING'])

        const late = await transitionJob(db, jobId, 'JOB-PROVISIONING', { actor: 'enclave' })
        const next = await transitionJob(db, jobId, 'RUN-COMPLETE', { actor: 'enclave' })

        expect(late.outcome).toBe('logged')
        expect(next).toMatchObject({ outcome: 'moved', from: 'JOB-RUNNING' })
    })

    it('writes an unlisted enclave pair in observe mode and warns', async () => {
        const { jobId } = await jobAt(['CODE-SUBMITTED'])
        const warn = vi.spyOn(logger, 'warn')

        const result = await transitionJob(db, jobId, 'JOB-RUNNING', { actor: 'enclave' })

        expect(result).toMatchObject({ outcome: 'moved', observed: true })
        expect(await statusesOf(jobId)).toContain('JOB-RUNNING')
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('which the transition table refuses'))
    })

    it('stamps two writes in one transaction in the order they happened', async () => {
        const { jobId } = await jobAt(['CODE-SUBMITTED'])

        await withTransaction(db, async (trx) => {
            await transitionJob(trx, jobId, 'CODE-APPROVED', { actor: 'reviewer' })
            await transitionJob(trx, jobId, 'JOB-READY', { actor: 'system' })
        })

        // Microseconds, which a JS Date drops: the two writes can share a millisecond.
        const rows = await db
            .selectFrom('jobStatusChange')
            .select('status')
            .select(sql<string>`(extract(epoch from created_at) * 1000000)::bigint::text`.as('micros'))
            .where('studyJobId', '=', jobId)
            .where('status', 'in', ['CODE-APPROVED', 'JOB-READY'])
            .orderBy('createdAt')
            .orderBy('status')
            .execute()
        const approved = rows.find((row) => row.status === 'CODE-APPROVED')!
        const ready = rows.find((row) => row.status === 'JOB-READY')!
        expect(BigInt(ready.micros)).toBeGreaterThan(BigInt(approved.micros))
    })

    it('records RESULTS-VIEWED once however often the lab opens the decision', async () => {
        const { jobId } = await jobAt(['RUN-COMPLETE', 'FILES-APPROVED'])

        await transitionJob(db, jobId, 'RESULTS-VIEWED', { actor: 'researcher' })
        const second = await transitionJob(db, jobId, 'RESULTS-VIEWED', { actor: 'researcher' })

        expect(second.outcome).toBe('noop')
        expect((await statusesOf(jobId)).filter((status) => status === 'RESULTS-VIEWED')).toHaveLength(1)
    })
})

describe('transitionJob JOB-ERRORED email', () => {
    const errorEmailsFor = async (statuses: StudyJobStatus[], actor: 'service' | 'enclave' | 'qa') => {
        const { jobId } = await jobAt(statuses)
        vi.mocked(sendDataPartnerCodeErroredEmail).mockClear()
        await transitionJob(db, jobId, 'JOB-ERRORED', { actor })
        await flushDeferred()
        return vi.mocked(sendDataPartnerCodeErroredEmail).mock.calls.length
    }

    it('emails on a scan failure', async () => {
        expect(await errorEmailsFor(['CODE-SUBMITTED'], 'service')).toBe(1)
    })

    it('emails on a packaging failure', async () => {
        expect(await errorEmailsFor(['CODE-APPROVED', 'JOB-PACKAGING'], 'service')).toBe(1)
    })

    it('emails on a run failure after an earlier scan failure', async () => {
        expect(await errorEmailsFor(['CODE-SUBMITTED', 'JOB-ERRORED', 'CODE-APPROVED', 'JOB-READY'], 'enclave')).toBe(1)
    })

    it('does not email again for a repeated failure', async () => {
        expect(await errorEmailsFor(['CODE-APPROVED', 'JOB-ERRORED'], 'service')).toBe(0)
    })

    it('does not email for a late scan failure after a change request', async () => {
        expect(await errorEmailsFor(['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'], 'service')).toBe(0)
    })

    it('does not email for a qa write', async () => {
        expect(await errorEmailsFor(['CODE-SUBMITTED'], 'qa')).toBe(0)
    })

    it('sends nothing when the transaction that moved the job rolls back', async () => {
        const { jobId } = await jobAt(['CODE-SUBMITTED'])
        vi.mocked(sendDataPartnerCodeErroredEmail).mockClear()

        await expect(
            withTransaction(db, async (trx) => {
                await transitionJob(trx, jobId, 'JOB-ERRORED', { actor: 'service' })
                throw new Error('later step failed')
            }),
        ).rejects.toThrow('later step failed')
        await flushDeferred()

        expect(sendDataPartnerCodeErroredEmail).not.toHaveBeenCalled()
        expect(await statusesOf(jobId)).not.toContain('JOB-ERRORED')
    })
})
