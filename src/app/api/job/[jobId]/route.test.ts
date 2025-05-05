import { expect, test } from 'vitest'
import * as apiHandler from './route'
import { insertTestStudyData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { db } from '@/database'

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
