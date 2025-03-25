import { expect, describe, it, beforeEach } from 'vitest'
import * as apiHandler from './route'
import { insertTestJobKeyData, mockApiMember } from '@/tests/unit.helpers'

describe('get keys', () => {
    let req: Request

    beforeEach(() => {
        req = new Request('http://localhost', {
            method: 'GET',
        })
    })

    it('does not work if requestor not a member', async () => {
        const response = await apiHandler.GET(req, { params: Promise.resolve({ jobId: 'jobId' }) })

        expect(response.status).toBe(401)
        expect(await response.json()).toStrictEqual({ error: 'Invalid or expired token' })
    })

    it('if data not present, return empty array', async () => {
        await mockApiMember({ identifier: 'testy-mctestface' })

        const response = await apiHandler.GET(req, {
            params: Promise.resolve({ jobId: '00000000-0000-0000-0000-000000000000' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toStrictEqual({ keys: [] })
    })

    it('getting keys', async () => {
        const member = await mockApiMember({ identifier: 'testy-mctestface' })

        const jobId = await insertTestJobKeyData({ memberId: member?.id || '' })

        const response = await apiHandler.GET(req, { params: Promise.resolve({ jobId: jobId }) })

        expect(await response.json()).toEqual({
            keys: expect.arrayContaining([
                {
                    jobId: jobId,
                    publicKey: JSON.parse(JSON.stringify(Buffer.from('testPublicKey1'))),
                    fingerprint: 'testFingerprint1',
                },
                {
                    jobId: jobId,
                    publicKey: JSON.parse(JSON.stringify(Buffer.from('testPublicKey2'))),
                    fingerprint: 'testFingerprint2',
                },
            ]),
        })
    })
})
