import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import {
    insertTestJobStatus,
    insertTestJobStatuses,
    insertTestProposalDecision,
    insertTestStudyData,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { flushDeferred } from '@/tests/vitest.setup'
import { db } from '@/database'
import { getOrCreateCurrentRoundJob } from '@/server/db/mutations'
import { deliver } from '@/server/mailgun'

// Spread the real module: mailer reads SI_EMAIL from it, and a bare `deliver` mock makes that throw.
vi.mock('@/server/mailgun', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/mailgun')>()),
    deliver: vi.fn(),
}))

const putStatus = (jobId: string, status: string) =>
    apiHandler.PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ status }) }), {
        params: Promise.resolve({ jobId }),
    })

const erroredRows = (jobId: string) =>
    db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'JOB-ERRORED')
        .execute()

test('updating status', async () => {
    const { org, user } = await mockSessionWithTestData()

    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ status: 'JOB-RUNNING' }),
    })

    const resp = await apiHandler.PUT(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)

    const sr = await db
        .selectFrom('jobStatusChange')
        .select(['status'])
        .where('jobStatusChange.studyJobId', '=', jobIds[0])
        .orderBy('jobStatusChange.id', 'desc')
        .executeTakeFirstOrThrow()

    expect(sr.status).toBe('JOB-RUNNING')
})

// setup-app reports every failed run here first, so this route sends the Data Partner's code errored email.
test('tells the Data Partner when the runner reports JOB-ERRORED', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { studyId, jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    await insertTestProposalDecision({ studyId, authorId: user.id })

    expect((await putStatus(jobIds[0], 'JOB-ERRORED')).ok).toBe(true)
    await flushDeferred()

    expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, template: 'vb - dp - code errored' }),
    )
})

// setup-app re-reports "Task failed to start" on every poll while the stopped ECS task is listed.
test('records and announces a repeated JOB-ERRORED only once', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { studyId, jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    await insertTestProposalDecision({ studyId, authorId: user.id })
    expect((await putStatus(jobIds[0], 'JOB-ERRORED')).ok).toBe(true)
    expect((await putStatus(jobIds[0], 'JOB-ERRORED')).ok).toBe(true)
    await flushDeferred()

    expect(await erroredRows(jobIds[0])).toHaveLength(1)
    expect(deliver).toHaveBeenCalledTimes(1)
})

test('ignores a JOB-ERRORED reported after the outputs were decided', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { studyId, jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    await insertTestProposalDecision({ studyId, authorId: user.id })
    await insertTestJobStatus(jobIds[0], 'FILES-REJECTED')

    expect((await putStatus(jobIds[0], 'JOB-ERRORED')).ok).toBe(true)
    await flushDeferred()

    expect(await erroredRows(jobIds[0])).toHaveLength(0)
    expect(deliver).not.toHaveBeenCalled()
})

// A decision on the errored outputs closes the round, so resubmitted code runs on a new job.
test("announces the next round's JOB-ERRORED after the code is resubmitted", async () => {
    const { org, user } = await mockSessionWithTestData()
    const { studyId, jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    await insertTestProposalDecision({ studyId, authorId: user.id })

    expect((await putStatus(jobIds[0], 'JOB-ERRORED')).ok).toBe(true)
    await insertTestJobStatus(jobIds[0], 'FILES-REJECTED')

    const nextRound = await getOrCreateCurrentRoundJob(db, studyId)
    expect(nextRound.id).not.toBe(jobIds[0])

    expect((await putStatus(nextRound.id, 'JOB-ERRORED')).ok).toBe(true)
    await flushDeferred()

    expect(await erroredRows(nextRound.id)).toHaveLength(1)
    expect(deliver).toHaveBeenCalledTimes(2)
})

test('refuses a second outputs decision on an errored run with 409 and writes nothing', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    await insertTestJobStatuses(jobIds[0], ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-ERRORED', 'FILES-APPROVED'])

    const resp = await putStatus(jobIds[0], 'FILES-REJECTED')

    expect(resp.status).toBe(409)
    expect(await resp.json()).toEqual({ error: 'transition-refused', from: 'FILES-APPROVED', to: 'FILES-REJECTED' })
    const rejected = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', jobIds[0])
        .where('status', '=', 'FILES-REJECTED')
        .execute()
    expect(rejected).toHaveLength(0)
})

test('answers 422 for any status once the run is complete, before the transition table runs', async () => {
    const { org, user } = await mockSessionWithTestData()
    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })
    await insertTestJobStatuses(jobIds[0], ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED'])

    expect((await putStatus(jobIds[0], 'FILES-REJECTED')).status).toBe(422)
})
