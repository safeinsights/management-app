import { throwNotFound } from '@/lib/errors'
import { getInfoForStudyId, getInfoForStudyJobId, getStudyJobInfo } from '@/server/db/queries'
import { currentDb } from '@/server/request-context'

type JobIdParams = { jobId: string } | { studyJobId: string }

const jobIdFrom = (params: JobIdParams) => ('jobId' in params ? params.jobId : params.studyJobId)

export const withStudySubject = ({ params: { studyId } }: { params: { studyId: string } }) => getInfoForStudyId(studyId)

export const withStudyAccessSubject = async ({ params: { studyId } }: { params: { studyId: string } }) => {
    const study = await currentDb()
        .selectFrom('study')
        .select(['orgId', 'submittedByOrgId', 'status'])
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow(throwNotFound('study'))
    return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
}

// Ids only: requireAbilityTo echoes the subject to a refused caller (MA-6).
export const withStudyJobSubject = ({ params }: { params: JobIdParams }) => getInfoForStudyJobId(jobIdFrom(params))

// No submittedByOrgId, so 'view StudyJob' does not admit the submitting lab.
export async function withReviewerStudyJobSubject(ctx: { params: JobIdParams }) {
    const { submittedByOrgId: _, ...subject } = await withStudyJobSubject(ctx)
    return subject
}

// After requireAbilityTo only: the full row carries the title and file paths.
export const loadStudyJob = async ({ studyJobId }: { studyJobId: string }) => ({
    studyJob: await getStudyJobInfo(studyJobId),
})
