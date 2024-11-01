import { expect, test } from 'vitest'
import * as apiHandler from './route'
import { insertTestStudyData, mockApiMember, readTestSupportFile } from '@/tests/helpers'
import { uuidToB64 } from '@/lib/uuid'
import { headers } from 'next/headers'
import jwt from 'jsonwebtoken'

test('missing JWT is rejected', async () => {
    const resp = await apiHandler.GET()
    expect(resp.status).toBe(401)
    expect(await resp.json()).toEqual({ error: 'Invalid or expired token' })
})

test('jwt with invalid iss is rejected', async () => {
    const privateKey = await readTestSupportFile('invalid_private_key.pem')
    const token = jwt.sign({ iss: 'unknown-member-identifier' }, privateKey, { algorithm: 'RS256' })
    headers().set('Authorization', `Bearer ${token}`)
    const resp = await apiHandler.GET()
    expect(resp.status).toBe(401)
    expect(await resp.json()).toEqual({ error: 'Invalid or expired token' })
})

test('jwt with expired token is rejected', async () => {
    const member = await mockApiMember({ identifier: 'testy-mctestface' })
    const privateKey = await readTestSupportFile('private_key.pem')
    const token = jwt.sign({ iss: member.identifier }, privateKey, { algorithm: 'RS256', expiresIn: -30 })
    headers().set('Authorization', `Bearer ${token}`)
    const resp = await apiHandler.GET()
    expect(resp.status).toBe(401)
    expect(await resp.json()).toEqual({ error: 'Invalid or expired token' })
})

test('return study runs', async () => {
    const member = await mockApiMember({ identifier: 'testy-mctestface' })

    const { runIds } = await insertTestStudyData({ memberId: member?.id || '' })

    const resp = await apiHandler.GET()
    const json = await resp.json()

    expect(json).toEqual({
        runs: expect.arrayContaining([
            expect.objectContaining({
                runId: runIds[1],
                title: 'my 1st study',
                status: 'in-progress',
                dataSources: ['all'],
                outputMimeType: 'text/csv',
                containerLocation: `test-container:${uuidToB64(runIds[1])}`,
            }),
            expect.objectContaining({
                runId: runIds[2],
                title: 'my 1st study',
                status: 'ready',
                dataSources: ['all'],
                outputMimeType: 'text/csv',
                containerLocation: `test-container:${uuidToB64(runIds[2])}`,
            }),
        ]),
    })
    expect(json).not.toEqual({
        runs: expect.arrayContaining([
            expect.objectContaining({
                runId: runIds[0],
            }),
        ]),
    })
})
