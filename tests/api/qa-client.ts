import type { APIRequestContext } from '@playwright/test'
import { E2E_QA_BEARER } from '../common.helpers'

// The QA provisioning routes (src/app/api/qa/*) and the SI-admin user delete. Under the fake Clerk any
// bearer resolves to the SI admin; the deployed tier passes a real Clerk session JWT instead. Each
// method returns the raw response.

export type QaInviteBody = { email: string; orgSlug: string; isAdmin?: boolean }

export type QaUserUpdate = {
    orgs?: { slug: string; isAdmin?: boolean }[]
    publicKey?: string
    password?: string
}

export type QaStudyStatus = 'APPROVED' | 'ARCHIVED' | 'CHANGE-REQUESTED' | 'DRAFT' | 'PENDING-REVIEW' | 'REJECTED'

export type QaJobStatus =
    | 'CODE-APPROVED'
    | 'CODE-CHANGES-REQUESTED'
    | 'CODE-SCANNED'
    | 'CODE-SUBMITTED'
    | 'FILES-APPROVED'
    | 'FILES-REJECTED'
    | 'INITIATED'
    | 'JOB-ERRORED'
    | 'JOB-PACKAGING'
    | 'JOB-PROVISIONING'
    | 'JOB-READY'
    | 'JOB-RUNNING'
    | 'RUN-COMPLETE'

// Plaintext artifacts: the route encrypts them to the reviewing org's enrolled keys.
export type QaStudyStateUpdate = {
    studyStatus?: QaStudyStatus
    jobStatus?: QaJobStatus
    result?: { name: string; content: string | Buffer }
    log?: { name: string; content: string | Buffer }
}

export function createQaClient(request: APIRequestContext, bearer: string = E2E_QA_BEARER) {
    const headers = { Authorization: `Bearer ${bearer}` }

    return {
        invite: (body: QaInviteBody) => request.post('/api/qa/invites', { headers, data: body }),
        patchUser: (idOrEmail: string, body: QaUserUpdate) =>
            request.patch(`/api/qa/users/${encodeURIComponent(idOrEmail)}`, { headers, data: body }),
        deleteUser: (idOrEmail: string) =>
            request.delete(`/api/qa/users/${encodeURIComponent(idOrEmail)}`, { headers }),
        deleteStudy: (studyId: string) => request.delete(`/api/qa/studies/${studyId}`, { headers }),
        setStudyState: (studyId: string, update: QaStudyStateUpdate) => {
            const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {}
            if (update.studyStatus) multipart.studyStatus = update.studyStatus
            if (update.jobStatus) multipart.jobStatus = update.jobStatus
            for (const key of ['result', 'log'] as const) {
                const file = update[key]
                if (!file) continue
                multipart[key] = {
                    name: file.name,
                    mimeType: 'application/octet-stream',
                    buffer: Buffer.from(file.content),
                }
            }
            return request.patch(`/api/qa/studies/${studyId}/status`, { headers, multipart })
        },
        // Not QA-guarded: deletes a real account, which is why it lives under /api/admin.
        adminDeleteUser: (userId: string) =>
            request.delete(`/api/admin/users/${encodeURIComponent(userId)}`, { headers }),
    }
}

export type QaClient = ReturnType<typeof createQaClient>
