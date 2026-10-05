import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { insertTestProposalDecision, insertTestStudyData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { flushDeferred } from '@/tests/vitest.setup'
import { db } from '@/database'
import { deliver } from '@/server/mailgun'

// Spread the real module: mailer reads SI_EMAIL from it, and a bare `deliver` mock makes that throw.
vi.mock('@/server/mailgun', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/mailgun')>()),
    deliver: vi.fn(),
}))

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

    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ status: 'JOB-ERRORED' }) })
    const resp = await apiHandler.PUT(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)
    await flushDeferred()

    expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email, template: 'vb - dp - code errored' }),
    )
})
