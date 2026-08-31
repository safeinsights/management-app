import { describe, expect, it, vi } from 'vitest'
import * as apiHandler from './route'
import { urlForStudyDocumentFile } from '@/server/storage'
import { createTestProposalDraft, mockSessionWithTestData, setTestStudyStatus } from '@/tests/unit.helpers'

// The route only reads the DB row for auth; stub the signed-URL helper so the redirect case doesn't
// need S3.
vi.mock('@/server/storage', async () => {
    const actual = await vi.importActual<typeof import('@/server/storage')>('@/server/storage')
    return { ...actual, urlForStudyDocumentFile: vi.fn(async () => 'https://signed.example/description.pdf') }
})

function request() {
    return new Request('http://localhost/dl/study-documents/x/DESCRIPTION/description.pdf', { method: 'GET' })
}

function params(studyId: string) {
    return { params: Promise.resolve({ studyId, fileType: 'DESCRIPTION', fileName: 'description.pdf' }) }
}

describe('GET /dl/study-documents/[studyId]/[fileType]/[fileName] (OTTER-596)', () => {
    it('returns 401 to a Data Organization member while the study is an unsubmitted draft', async () => {
        const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'dl-docs-draft-enclave' })

        await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
        const resp = await apiHandler.GET(request(), params(studyId))

        expect(resp.status).toBe(401)
    })

    it('redirects a Data Organization member to the signed URL once the study is submitted', async () => {
        const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'dl-docs-submitted-enclave' })
        await setTestStudyStatus(studyId, 'PENDING-REVIEW')

        await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
        const resp = await apiHandler.GET(request(), params(studyId))

        expect(resp.status).toBe(307)
        expect(resp.headers.get('location')).toBe('https://signed.example/description.pdf')
        expect(vi.mocked(urlForStudyDocumentFile)).toHaveBeenCalled()
    })
})
