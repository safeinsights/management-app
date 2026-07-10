import { describe, expect, it, vi } from 'vitest'
import * as apiHandler from './route'
import { db } from '@/database'
import { BLANK_UUID, insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'

// The route only reads the DB row for the file path; stub the signed-URL helper so
// the redirect case doesn't need S3.
vi.mock('@/server/storage', async () => {
    const actual = await vi.importActual<typeof import('@/server/storage')>('@/server/storage')
    return { ...actual, urlForFile: vi.fn(async () => 'https://signed.example/security-scan-log.txt') }
})

function request() {
    return new Request('http://localhost/dl/scan-log/x', { method: 'GET' })
}

async function insertScanLog(studyJobId: string) {
    await db
        .insertInto('studyJobFile')
        .values({
            studyJobId,
            name: 'security-scan-log.txt',
            path: `studies/x/jobs/${studyJobId}/results/security-scan-log.txt`,
            fileType: 'SECURITY-SCAN-LOG',
        })
        .execute()
}

describe('GET /dl/scan-log/[jobId]', () => {
    it('returns 404 when the job has no plaintext scan log', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { job } = await insertTestStudyJobData({ org, researcherId: user.id })

        const resp = await apiHandler.GET(request(), { params: Promise.resolve({ jobId: job.id }) })

        expect(resp.status).toBe(404)
    })

    it('returns 401 (not 404) for an unknown job, so job existence is not disclosed', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        const resp = await apiHandler.GET(request(), { params: Promise.resolve({ jobId: BLANK_UUID }) })

        expect(resp.status).toBe(401)
    })

    it('returns 401 when the requester cannot view the job (different org)', async () => {
        // Job is created under its own org; the session below belongs to a different org.
        const { job } = await insertTestStudyJobData()
        await insertScanLog(job.id)

        await mockSessionWithTestData({ orgType: 'enclave' })

        const resp = await apiHandler.GET(request(), { params: Promise.resolve({ jobId: job.id }) })

        expect(resp.status).toBe(401)
    })

    it('redirects to the signed URL when the log exists and the user can view it', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { job } = await insertTestStudyJobData({ org, researcherId: user.id })
        await insertScanLog(job.id)

        const resp = await apiHandler.GET(request(), { params: Promise.resolve({ jobId: job.id }) })

        expect(resp.status).toBe(307)
        expect(resp.headers.get('location')).toBe('https://signed.example/security-scan-log.txt')
    })
})
