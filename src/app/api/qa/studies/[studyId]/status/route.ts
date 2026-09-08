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

const statusSchema = z.object({
    studyStatus: z.enum(STUDY_STATUSES).optional(),
    jobStatus: z.enum(JOB_STATUSES).optional(),
})

// Multipart rather than JSON so QA can set statuses and attach a file in one curl.
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
            // A string means the caller sent `result=foo` instead of `result=@foo`; accepting it
            // would store a file containing the literal text.
            throw new QaInvalidRequestError(`form field "${key}" must be a file`)
        }
    }

    if (!statuses.studyStatus && !statuses.jobStatus && Object.keys(files).length === 0) {
        throw new QaInvalidRequestError('provide at least one of studyStatus, jobStatus, result, or log')
    }

    return { ...statuses, files }
}

// Files arrive as plaintext under the `result` and `log` keys and are encrypted for the reviewing
// org before storage.
export const PATCH = async (req: Request, { params }: { params: Promise<{ studyId: string }> }) => {
    const auth = await requireQaAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { studyId } = await params
    try {
        const update = await parseRequest(req)
        // Resolved first so a bad body or a non-QA study leaves no attempt row.
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
                jobCreated: applied.jobCreated,
                studyStatus: applied.studyStatus,
                files: applied.files.map((file) => file.fileType),
            }),
        )

        return NextResponse.json(result)
    } catch (error) {
        return qaErrorResponse(error)
    }
}
