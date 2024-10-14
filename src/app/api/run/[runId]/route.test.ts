import { vi, expect, test, beforeEach } from 'vitest'
import * as apiHandler from './route'
import { insertTestData, readTestSupportFile } from '@/tests/helpers'
import jwt from 'jsonwebtoken'
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

test('updating status', async () => {
    const { runIds } = await insertTestData()
    const req = new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ status: 'running' }),
    })

    const resp = await apiHandler.PUT(req, { params: { runId: runIds[0] } })
    expect(resp.ok).toBe(true)

    const sr = await db.selectFrom('studyRun').select('status').where('id', '=', runIds[0]).executeTakeFirstOrThrow()

    expect(sr.status).toBe('running')
})
