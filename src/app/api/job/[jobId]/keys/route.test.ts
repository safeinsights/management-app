import { expect, describe, it, beforeEach } from 'vitest'
import * as apiHandler from './route'
import { insertTestStudyJobUsers, insertTestOrg } from '@/tests/unit.helpers'
import { db } from '@/database'

describe('get keys', () => {
    let req: Request

    beforeEach(() => {
        req = new Request('http://localhost', {
            method: 'GET',
        })
    })

    it('does not work if requestor not a org', async () => {
        const response = await apiHandler.GET(req, { params: Promise.resolve({ jobId: 'jobId' }) })

        expect(response.status).toBe(401)
        expect(await response.json()).toStrictEqual({ error: 'Invalid or expired token' })
    })

    it('if data not present, return empty array', async () => {
        await insertTestOrg()

        const response = await apiHandler.GET(req, {
            params: Promise.resolve({ jobId: '00000000-0000-0000-0000-000000000000' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toStrictEqual({ keys: [] })
    })

    it('getting keys', async () => {
        const { job } = await insertTestStudyJobUsers()

        const response = await apiHandler.GET(req, { params: Promise.resolve({ jobId: job.id }) })

        expect(await response.json()).toEqual({
            keys: expect.arrayContaining([
                {
                    jobId: job.id,
                    publicKey: JSON.parse(JSON.stringify(Buffer.from('testPublicKey1'))),
                    fingerprint: 'testFingerprint1',
                },
            ]),
        })
    })

    it('errors when a job has a bad key', async () => {
        const { job } = await insertTestStudyJobUsers()
        await db
            .updateTable('userPublicKey')
            .set({ publicKey: Buffer.from('') })
            .execute()

        const response = await apiHandler.GET(req, { params: Promise.resolve({ jobId: job.id }) })
        expect(await response.json()).toThrow(`Invalid encryption key for ${job.id}: Invalid keyData`)
    })
})
