import * as apiHandler from './route'
import { BLANK_UUID, describe, expect, it, mockSessionWithTestData } from '@/tests/unit.helpers'

describe('GET /dl/results/[jobId]/[fileName]', () => {
    it('returns 404 for an unknown job', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })
        const request = new Request('http://localhost/dl/results/x/results.csv', { method: 'GET' })

        const resp = await apiHandler.GET(request, {
            params: Promise.resolve({ jobId: BLANK_UUID, fileName: 'results.csv' }),
        })

        expect(resp.status).toBe(404)
    })
})
