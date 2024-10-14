import { vi, expect, test, beforeEach } from 'vitest'
import * as apiHandler from './route'
import { insertTestData, readTestSupportFile } from '@/tests/helpers'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { headers } from 'next/headers'

import { getMemberFromIdentifier } from '@/server/members'
import { BLANK_UUID, db } from '@/database'
import { getUploadTmpDirectory } from '@/server/config'

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

test('handling upload', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'testfile.txt', { type: 'text/plain' })
    const formData = new FormData()
    formData.append('file', file)

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: formData,
    })

    const { runIds } = await insertTestData()

    const resp = await apiHandler.POST(req, { params: { runId: runIds[0] } })

    expect(resp.ok).toBe(true)

    const filePath = path.join(getUploadTmpDirectory(), 'testfile.txt')

    expect(fs.existsSync(filePath)).toBe(true)

    const sr = await db
        .selectFrom('studyRun')
        .select('resultsLocation')
        .where('id', '=', runIds[0])
        .executeTakeFirstOrThrow()

    expect(sr.resultsLocation).toBe(filePath)
})
