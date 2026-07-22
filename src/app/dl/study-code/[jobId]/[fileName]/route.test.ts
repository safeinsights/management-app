import { describe, expect, it, vi } from 'vitest'
import * as apiHandler from './route'
import { db } from '@/database'
import { urlForStudyJobCodeFile } from '@/server/storage'
import { createTestProposalDraft, mockSessionWithTestData, setTestStudyStatus } from '@/tests/unit.helpers'

// The route only reads the DB row for auth + path; stub the signed-URL helper so the redirect case
// doesn't need S3.
vi.mock('@/server/storage', async () => {
    const actual = await vi.importActual<typeof import('@/server/storage')>('@/server/storage')
    return { ...actual, urlForStudyJobCodeFile: vi.fn(async () => 'https://signed.example/main.r') }
})

function request() {
    return new Request('http://localhost/dl/study-code/x/main.r', { method: 'GET' })
}

// Attach a code job + MAIN-CODE file to the draft so there is something to download.
async function seedCodeJob(studyId: string) {
    const job = await db.insertInto('studyJob').values({ studyId }).returning('id').executeTakeFirstOrThrow()
    await db
        .insertInto('studyJobFile')
        .values({ studyJobId: job.id, name: 'main.r', path: `code/${studyId}/main.r`, fileType: 'MAIN-CODE' })
        .execute()
    return job.id
}

describe('GET /dl/study-code/[jobId]/[fileName] (OTTER-596)', () => {
    it('returns 401 to a Data Organization member while the study is an unsubmitted draft', async () => {
        const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'dl-code-draft-enclave' })
        const jobId = await seedCodeJob(studyId)

        await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
        const resp = await apiHandler.GET(request(), { params: Promise.resolve({ jobId, fileName: 'main.r' }) })

        expect(resp.status).toBe(401)
    })

    it('redirects a Data Organization member to the signed URL once the study is submitted', async () => {
        const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'dl-code-submitted-enclave' })
        const jobId = await seedCodeJob(studyId)
        await setTestStudyStatus(studyId, 'PENDING-REVIEW')

        await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
        const resp = await apiHandler.GET(request(), { params: Promise.resolve({ jobId, fileName: 'main.r' }) })

        expect(resp.status).toBe(307)
        expect(resp.headers.get('location')).toBe('https://signed.example/main.r')
        expect(vi.mocked(urlForStudyJobCodeFile)).toHaveBeenCalled()
    })
})
