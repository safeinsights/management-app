import { expect, test } from 'vitest'
import * as apiHandler from './route'
import { insertTestStudyData, mockApiMember } from '@/tests/unit.helpers'
import { db } from '@/database'

test('updating status', async () => {
    const member = await mockApiMember({ identifier: 'testy-mctestface' })
    const { jobIds } = await insertTestStudyData({ memberId: member.id })

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ status: 'RUNNING' }),
    })

    const resp = await apiHandler.PUT(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)

    const sr = await db
        .selectFrom('jobStatusChange')
        .select('status')
        .where('jobStatusChange.studyJobId', '=', jobIds[0])
        .executeTakeFirstOrThrow()

    expect(sr.status).toBe('RUNNING')
})
