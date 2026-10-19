import { NotFoundError, throwNotFound } from '@/lib/errors'
import { getInfoForStudyId, getInfoForStudyJobId, getStudyJobInfo } from '@/server/db/queries'
import { currentDb } from '@/server/request-context'

type JobIdParams = { jobId: string } | { studyJobId: string }

const jobIdFrom = (params: JobIdParams) => ('jobId' in params ? params.jobId : params.studyJobId)

export async function withStudySubject({ params: { studyId } }: { params: { studyId: string } }) {
    const study = await getInfoForStudyId(studyId, false)
    if (!study) throw new NotFoundError({ user: 'study was not found' })
    return study
}

export const withStudyAccessSubject = async ({ params: { studyId } }: { params: { studyId: string } }) => {
    const study = await currentDb()
        .selectFrom('study')
        .select(['orgId', 'submittedByOrgId', 'status'])
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow(throwNotFound('study'))
    return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
}

// Ids only: requireAbilityTo echoes the subject to a refused caller (MA-6).
export async function withStudyJobSubject({ params }: { params: JobIdParams }) {
    const studyJobId = jobIdFrom(params)
    const job = await getInfoForStudyJobId(studyJobId, false)
    if (!job) throw new NotFoundError({ user: `job for study job id ${studyJobId} was not found` })
    return job
}

// No submittedByOrgId, so 'view StudyJob' does not admit the submitting lab.
export async function withReviewerStudyJobSubject(ctx: { params: JobIdParams }) {
    const { submittedByOrgId: _, ...subject } = await withStudyJobSubject(ctx)
    return subject
}

// After requireAbilityTo only: the full row carries the title and file paths.
export const loadStudyJob = async ({ studyJobId }: { studyJobId: string }) => ({
    studyJob: await getStudyJobInfo(studyJobId),
})
