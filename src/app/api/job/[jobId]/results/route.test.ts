import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { insertTestOrg, insertTestStudyData } from '@/tests/unit.helpers'
import { db } from '@/database'
import { sendResultsReadyForReviewEmail } from '@/server/mailgun'
import { fetchStudyResultsFile } from '@/server/storage'

vi.mock('@/server/mailgun', () => ({
    sendResultsReadyForReviewEmail: vi.fn(),
}))

test('handling upload', async () => {
    const org = await insertTestOrg()

    const file = new File([new Uint8Array([1, 2, 3])], 'testfile.txt', { type: 'text/plain' })

    const formData = new FormData()
    formData.append('file', file)

    const req = new Request('http://localhost', {
        method: 'PUT',
        body: formData,
    })

    const { jobIds, studyId } = await insertTestStudyData({ org })

    const resp = await apiHandler.POST(req, { params: Promise.resolve({ jobId: jobIds[0] }) })
    expect(resp.ok).toBe(true)
    expect(sendResultsReadyForReviewEmail).toHaveBeenCalled()

    const studyResultsFile = await fetchStudyResultsFile({
        orgSlug: org.slug,
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
