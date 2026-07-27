import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/database'
import { requireQaAdmin, findQaStudy } from '@/server/qa-cleanup'
import { QaInvalidRequestError } from '@/server/qa-provision'
import { setQaStudyState, QA_FILE_KEYS, type QaFileKey } from '@/server/qa-study-state'
import { qaErrorResponse } from '../../../responses'
import { auditQaOperation } from '../../../audit'

const STUDY_STATUSES = ['APPROVED', 'ARCHIVED', 'CHANGE-REQUESTED', 'DRAFT', 'PENDING-REVIEW', 'REJECTED'] as const

const JOB_STATUSES = [
    'CODE-APPROVED',
    'CODE-CHANGES-REQUESTED',
    'CODE-REJECTED',
    'CODE-SCANNED',
    'CODE-SUBMITTED',
    'FILES-APPROVED',
    'FILES-REJECTED',
    'INITIATED',
    'JOB-ERRORED',
    'JOB-PACKAGING',
    'JOB-PROVISIONING',
    'JOB-READY',
    'JOB-RUNNING',
    'RUN-COMPLETE',
] as const

// Both statuses are optional so a caller can attach files without moving either, but a
// request that sets nothing at all is a mistake worth reporting rather than a no-op 200.
const statusSchema = z.object({
    studyStatus: z.enum(STUDY_STATUSES).optional(),
    jobStatus: z.enum(JOB_STATUSES).optional(),
})

/**
 * Read the status fields and file parts out of a multipart body.
 *
 * multipart is required rather than JSON because the point of the endpoint is attaching a
 * file; the status fields ride along as ordinary form fields so QA can do both in one curl.
 */
async function parseRequest(req: Request) {
    let formData: FormData
    try {
        formData = await req.formData()
    } catch {
        throw new QaInvalidRequestError('request body must be multipart/form-data')
    }

    const statuses = statusSchema.parse({
        studyStatus: formData.get('studyStatus') ?? undefined,
        jobStatus: formData.get('jobStatus') ?? undefined,
    })

    const files: Partial<Record<QaFileKey, File>> = {}
    for (const key of Object.keys(QA_FILE_KEYS) as QaFileKey[]) {
        const value = formData.get(key)
        if (value instanceof File && value.size > 0) {
            files[key] = value
        } else if (value != null) {
            // A string here means the caller sent `result=foo` instead of `result=@foo`;
            // accepting it would store a file containing the literal text.
            throw new QaInvalidRequestError(`form field "${key}" must be a file`)
        }
    }

    if (!statuses.studyStatus && !statuses.jobStatus && Object.keys(files).length === 0) {
        throw new QaInvalidRequestError('provide at least one of studyStatus, jobStatus, result, or log')
    }

    return { ...statuses, files }
}

/**
 * Set a study's status, its latest job's status, and/or attach result and log artifacts.
 *
 * Files are sent as plaintext under the `result` and `log` form keys and are encrypted
 * server-side for the reviewing org before storage.
 */
export const PATCH = async (req: Request, { params }: { params: Promise<{ studyId: string }> }) => {
    const auth = await requireQaAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { studyId } = await params
    try {
        const update = await parseRequest(req)
        // Resolved before anything is audited so a bad body or a non-QA study is rejected
        // without leaving an attempt row.
        const study = await findQaStudy(db, studyId)

        const result = await auditQaOperation(
            {
                actorUserId: auth.user.id,
                eventType: 'UPDATED',
                recordType: 'STUDY',
                recordId: study.studyId,
                metadata: {
                    orgSlug: study.orgSlug,
                    requested: {
                        studyStatus: update.studyStatus,
                        jobStatus: update.jobStatus,
                        files: Object.keys(update.files),
                    },
                },
            },
            () => setQaStudyState(db, study, update),
            (applied) => ({
                studyJobId: applied.studyJobId ?? undefined,
                studyStatus: applied.studyStatus,
                files: applied.files.map((file) => file.fileType),
            }),
        )

        return NextResponse.json(result)
    } catch (error) {
        return qaErrorResponse(error)
    }
}
