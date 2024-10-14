import { vi, expect, test, beforeEach } from 'vitest'
import * as apiHandler from './route'
import { insertTestData, readTestSupportFile } from '@/tests/helpers'
import jwt from 'jsonwebtoken'
import { uuidToB64 } from '@/lib/uuid'
import { headers } from 'next/headers'

import { getMemberFromIdentifier } from '@/server/members'
import { BLANK_UUID, db } from '@/database'

const privateKey = await readTestSupportFile('private_key.pem')
const publicKey = await readTestSupportFile('public_key.pem')

vi.mock('@/server/members', () => ({ getMemberFromIdentifier: vi.fn() }))

beforeEach(async () => {
    await db
        .insertInto('member')
        .values({ identifier: 'testy-mctestface', id: BLANK_UUID, name: 'test', email: 'none@test.com', publicKey })
        .execute()

    vi.mocked(getMemberFromIdentifier).mockImplementation(async (identifier: string) => ({
        identifier,
        id: BLANK_UUID,
        publicKey,
        email: '',
    }))

    headers().set(
        'Authorization',
        `Bearer ${jwt.sign(
            {
                iss: 'testy-mctestface',
            },
            privateKey,
            { algorithm: 'RS256' },
        )}`,
    )
})

test('jwt is verified', async () => {
    const resp = await apiHandler.GET()
    expect(resp.status).toBe(200)
    expect(await resp.json()).toEqual([])
})

test('return study runs', async () => {
    const { runIds } = await insertTestData()

    const resp = await apiHandler.GET()
    const json = await resp.json()

    expect(json).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                runId: runIds[0],
                title: 'my 1st study',
                status: 'pending',
                dataSources: ['all'],
                outputMimeType: 'text/csv',
                containerLocation: `test-container:${uuidToB64(runIds[0])}`,
            }),
            expect.objectContaining({
                runId: runIds[1],
                title: 'my 1st study',
                status: 'pending',
                dataSources: ['all'],
                outputMimeType: 'text/csv',
                containerLocation: `test-container:${uuidToB64(runIds[1])}`,
            }),
        ]),
    )
})
