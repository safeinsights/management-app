import { expect, test } from 'vitest'
import * as apiHandler from './route'
import { insertTestStudyData, mockApiMember } from '@/tests/unit.helpers'
import { db } from '@/database'

test('updating status', async () => {
    const member = await mockApiMember({ identifier: 'testy-mctestface' })
    const { runIds } = await insertTestStudyData({ memberId: member.id })

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ status: 'RUNNING' }),
    })

    const resp = await apiHandler.PUT(req, { params: Promise.resolve({ runId: runIds[0] }) })
    expect(resp.ok).toBe(true)

    const sr = await db.selectFrom('studyRun').select('status').where('id', '=', runIds[0]).executeTakeFirstOrThrow()

    expect(sr.status).toBe('RUNNING')
})
