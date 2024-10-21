import { expect, test } from 'vitest'
import * as apiHandler from './route'
import { insertTestStudyData, mockApiMember } from '@/tests/helpers'
import fs from 'fs'
import path from 'path'
import { db } from '@/database'
import { getUploadTmpDirectory } from '@/server/config'

test('handling upload', async () => {
    const member = await mockApiMember({ identifier: 'testy-mctestface' })

    const file = new File([new Uint8Array([1, 2, 3])], 'testfile.txt', { type: 'text/plain' })
    const formData = new FormData()
    formData.append('file', file)

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: formData,
    })

    const { runIds } = await insertTestStudyData({ memberId: member.id })

    const resp = await apiHandler.POST(req, { params: { runId: runIds[0] } })

    expect(resp.ok).toBe(true)

    const filePath = path.join(getUploadTmpDirectory(), 'testfile.txt')

    expect(fs.existsSync(filePath)).toBe(true)

    const sr = await db
        .selectFrom('studyRun')
        .select('resultsPath')
        .where('id', '=', runIds[0])
        .executeTakeFirstOrThrow()

    expect(sr.resultsPath).toBe(filePath)
})