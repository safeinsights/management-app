import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { insertTestOrg, insertTestStudyData } from '@/tests/unit.helpers'
import { db } from '@/database'
import { sendResultsReadyForReviewEmail } from '@/server/mailer'
import { fetchFileContents } from '@/server/storage'

vi.mock('@/server/mailer', () => ({
    sendResultsReadyForReviewEmail: vi.fn(),
}))

test('handling upload', async () => {
    const org = await insertTestOrg()

    const file = new File([new Uint8Array([1, 2, 3])], 'testfile.txt', { type: 'text/plain' })

    const formData = new FormData()
    formData.append('result', file)

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: formData,
    })

    const { jobIds } = await insertTestStudyData({ org })

    const resp = await apiHandler.POST(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)
    expect(sendResultsReadyForReviewEmail).toHaveBeenCalled()

    const sr = await db
        .selectFrom('studyJobFile')
        .select(['path', 'fileType'])
        .where('studyJobFile.studyJobId', '=', jobIds[0])
        .executeTakeFirstOrThrow()

    expect(sr).toMatchObject({
        path: expect.any(String),
        fileType: 'ENCRYPTED-RESULT',
    })

    const contents = await fetchFileContents(sr.path)
    expect(contents).toBeInstanceOf(Blob)
})
