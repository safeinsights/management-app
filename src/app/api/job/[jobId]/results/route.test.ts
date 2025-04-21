import { expect, test, vi } from 'vitest'
import * as apiHandler from './route'
import { insertTestStudyData, insertTestMember } from '@/tests/unit.helpers'
import fs from 'fs'
import path from 'path'
import { db } from '@/database'
import { pathForStudyJobResults } from '@/lib/paths'
import { getUploadTmpDirectory } from '@/server/config'
import { sendResultsReadyForReviewEmail } from '@/server/mailgun'

vi.mock('@/server/mailgun', () => ({
    sendResultsReadyForReviewEmail: vi.fn(),
}))

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
    expect(sendResultsReadyForReviewEmail).toHaveBeenCalled()

    const filePath = path.join(
        getUploadTmpDirectory(),
        pathForStudyJobResults({
            memberSlug: member.slug,
            studyId,
            studyJobId: jobIds[0],
            resultsType: 'ENCRYPTED',
        }),
    )

    expect(fs.existsSync(filePath)).toBeTruthy()

    const sr = await db
        .selectFrom('studyJob')
        .select('resultsPath')
        .where('id', '=', jobIds[0])
        .executeTakeFirstOrThrow()
    // we don't store the path in the database until results are approved
    expect(sr.resultsPath).toBeNull()
})
