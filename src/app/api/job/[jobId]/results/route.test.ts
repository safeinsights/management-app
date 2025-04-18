import { expect, test } from 'vitest'
import * as apiHandler from './route'
import { insertTestMember, insertTestStudyData } from '@/tests/unit.helpers'
import { db } from '@/database'
import { fetchStudyResultsFile } from '@/server/storage'

test('handling upload', async () => {
    const member = await insertTestMember()

    const file = new File([new Uint8Array([1, 2, 3])], 'testfile.txt', { type: 'text/plain' })

    const formData = new FormData()
    formData.append('file', file)

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: formData,
    })

    const { jobIds, studyId } = await insertTestStudyData({ member })

    const resp = await apiHandler.POST(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)

    const studyResultsFile = await fetchStudyResultsFile({
        memberSlug: member.slug,
        studyId,
        studyJobId: jobIds[0],
        resultsType: 'ENCRYPTED',
    })

    expect(studyResultsFile).toBeTruthy()

    const sr = await db
        .selectFrom('studyJob')
        .select('resultsPath')
        .where('id', '=', jobIds[0])
        .executeTakeFirstOrThrow()

    // we don't store the path in the database until results are approved
    expect(sr.resultsPath).toBeNull()
})
