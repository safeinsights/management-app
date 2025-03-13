import { expect, test } from 'vitest'
import * as apiHandler from './route'
import { insertTestJobKeyData, mockApiMember } from '@/tests/unit.helpers'

test('does not work if requestor not a member', async () => {
    const response = await apiHandler.GET({ params: Promise.resolve({ jobId: 'jobId' }) })

    expect(response.status).toBe(401)
    expect(await response.json()).toStrictEqual({ error: 'Invalid or expired token' })
})

test('does not work without job id', async () => {
    await mockApiMember({ identifier: 'testy-mctestface' })

    const response = await apiHandler.GET({ params: Promise.resolve({ jobId: null }) })

    expect(response.status).toBe(400)
    expect(await response.text()).toStrictEqual('Job id not provided')
})

test('if data not present, return empty array', async () => {
    await mockApiMember({ identifier: 'testy-mctestface' })

    const response = await apiHandler.GET({
        params: Promise.resolve({ jobId: '00000000-0000-0000-0000-000000000000' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual({ keys: [] })
})

test('getting keys', async () => {
    const member = await mockApiMember({ identifier: 'testy-mctestface' })

    const jobId = await insertTestJobKeyData({ memberId: member?.id || '' })

    const response = await apiHandler.GET({ params: Promise.resolve({ jobId: jobId }) })

    expect(await response.json()).toStrictEqual({
        keys: [
            {
                jobId: jobId,
                publicKey: 'testPublicKey1',
                fingerprint: 'testFingerprint1',
            },
            {
                jobId: jobId,
                publicKey: 'testPublicKey2',
                fingerprint: 'testFingerprint2',
            },
        ],
    })
})
