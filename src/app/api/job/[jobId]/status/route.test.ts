import { expect, test } from 'vitest'
import * as apiHandler from './route'
import { insertTestStudyData, mockSessionWithTestData } from '@/tests/unit.helpers'

test('getting status', async () => {
    const { org, user } = await mockSessionWithTestData()

    const { jobIds } = await insertTestStudyData({ org, researcherId: user.id })

    const req = new Request('http://localhost', {
        method: 'GET',
    })

    const resp = await apiHandler.GET(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)
    expect(await resp.json()).toStrictEqual({ status: 'INITIATED' })
})
