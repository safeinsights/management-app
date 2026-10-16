import { Selectable } from 'kysely'
import { jsonArrayFrom } from '@/database'
import { ActionSuccessType } from '@/lib/types'
import { throwNotFound } from '@/lib/errors'
import { currentDb } from '@/server/request-context'
import { FileType } from '@/database/types'
import { JOB_FAILURE_REASONS } from '@/lib/job-error-details'

export async function getStudyJobInfo(studyJobId: string) {
    return await currentDb()
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'study.orgId', 'org.id')
        .select((eb) => [
            'studyJob.id as studyJobId',
            'studyJob.studyId',
            'studyJob.createdAt',
            'study.title as studyTitle',
            'study.status',
            'org.id as orgId',
            'org.slug as orgSlug',
            'study.submittedByOrgId',
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['status', 'createdAt'])
                    .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                    .orderBy('createdAt', 'desc')
                    .orderBy('jobStatusChange.id', 'desc'),
            ).as('statusChanges'),
            jsonArrayFrom(
                eb
                    .selectFrom('studyJobFile')
                    .select(['id', 'name', 'path', 'fileType'])
                    .whereRef('studyJobFile.studyJobId', '=', 'studyJob.id'),
            ).as('files'),
        ])
        .where('studyJob.id', '=', studyJobId)
        .executeTakeFirstOrThrow(throwNotFound(`job for study job id ${studyJobId}`))
}

export type LatestJobForStudy = ActionSuccessType<typeof latestJobForStudy>

function latestJobForStudyQuery(studyId: string) {
    return currentDb()
        .selectFrom('studyJob')
        .selectAll('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .select(['study.orgId', 'study.language', 'study.status'])
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['jobStatusChange.status', 'jobStatusChange.createdAt'])
                    .orderBy('createdAt', 'desc')
                    .orderBy('jobStatusChange.id', 'desc')
                    .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id'),
            ).as('statusChanges'),
            jsonArrayFrom(
                eb
                    .selectFrom('studyJobFile')
                    .select(['id', 'name', 'path', 'fileType', 'createdAt'])
                    .whereRef('studyJobFile.studyJobId', '=', 'studyJob.id'),
            ).as('files'),
        ])
        .where('studyJob.studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .orderBy('studyJob.id', 'desc')
        .limit(1)
}

// Routing that must anchor on the *submitted* code uses this, so an in-progress new round does not
// mask the submission still under review.
function latestSubmittedJobForStudyQuery(studyId: string) {
    return latestJobForStudyQuery(studyId).where((eb) =>
        eb.exists(
            eb
                .selectFrom('jobStatusChange')
                .select('jobStatusChange.id')
                .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                .where('jobStatusChange.status', '!=', 'INITIATED'),
        ),
    )
}

export const latestJobForStudy = async (studyId: string) => {
    return latestJobForStudyQuery(studyId).executeTakeFirstOrThrow(throwNotFound(`job for study ${studyId}`))
}

export async function latestJobForStudyOrNull(studyId: string): Promise<LatestJobForStudy | null> {
    return (await latestJobForStudyQuery(studyId).executeTakeFirst()) ?? null
}

export const latestSubmittedJobForStudy = async (studyId: string): Promise<LatestJobForStudy | null> => {
    return (await latestSubmittedJobForStudyQuery(studyId).executeTakeFirst()) ?? null
}

// jobStatusChange.message can hold raw service/AWS text, so it must not be selected in queries the
// researcher can reach; the filter to known codes stops a duplicate JOB-ERRORED masking the real one.
// (OTTER-524)
export async function latestRecordedJobFailureReason(studyJobId: string): Promise<string | null> {
    // An empty code set would render `message in ()`, which Postgres rejects.
    const knownReasons: string[] = [...JOB_FAILURE_REASONS]
    if (knownReasons.length === 0) return null

    const row = await currentDb()
        .selectFrom('jobStatusChange')
        .select('message')
        .where('studyJobId', '=', studyJobId)
        .where('status', '=', 'JOB-ERRORED')
        .where('message', 'in', knownReasons)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .limit(1)
        .executeTakeFirst()

    return row?.message ?? null
}

const studyJobInfoQuery = (studyJobId: string) =>
    currentDb()
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select([
            'org.id as orgId',
            'org.slug as orgSlug',
            'study.id as studyId',
            'studyJob.id as studyJobId',
            'study.submittedByOrgId',
            'study.status',
        ])
        .where('studyJob.id', '=', studyJobId)

type StudyJobInfo = Awaited<ReturnType<ReturnType<typeof studyJobInfoQuery>['executeTakeFirstOrThrow']>>

export async function getInfoForStudyJobId(studyJobId: string, throwIfNotFound?: true): Promise<StudyJobInfo>
export async function getInfoForStudyJobId(
    studyJobId: string,
    throwIfNotFound: false,
): Promise<StudyJobInfo | undefined>
export async function getInfoForStudyJobId(
    studyJobId: string,
    throwIfNotFound = true,
): Promise<StudyJobInfo | undefined> {
    const query = studyJobInfoQuery(studyJobId)
    return throwIfNotFound ? await query.executeTakeFirstOrThrow() : await query.executeTakeFirst()
}

type JobDetails = { id: string; name: string; path: string }

export async function getStudyJobFileOfType(
    studyJobId: string,
    fileType: FileType,
    throwIfNotFound?: true,
): Promise<Selectable<JobDetails>>
export async function getStudyJobFileOfType(
    studyJobId: string,
    fileType: FileType,
    throwIfNotFound?: false,
): Promise<Selectable<JobDetails> | undefined>
export async function getStudyJobFileOfType(
    studyJobId: string,
    fileType: FileType,
    throwIfNotFound = true,
): Promise<Selectable<JobDetails> | undefined> {
    const file = await currentDb()
        .selectFrom('studyJobFile')
        .innerJoin('studyJob', 'studyJob.id', 'studyJobFile.studyJobId')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .select(['studyJobFile.id', 'studyJobFile.name', 'studyJobFile.path', 'study.orgId', 'study.submittedByOrgId'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', '=', fileType)
        // A resubmission can leave more than one row of a given type for a job; take the newest.
        .orderBy('studyJobFile.createdAt', 'desc')
        .orderBy('studyJobFile.id', 'desc')
        .executeTakeFirst()

    if (!file && throwIfNotFound) {
        throw new Error(`File of type ${fileType} not found for study job ${studyJobId}`)
    }
    return file
}

export async function getOrgIdForJobId(jobId: string) {
    const job = await currentDb()
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .where('studyJob.id', '=', jobId)
        .select(['study.orgId'])
        .executeTakeFirst()

    return job?.orgId
}

// Scoped to the study so a job id from another study yields nothing.
export async function latestCodeSubmissionAt(studyId: string, jobId: string): Promise<Date | undefined> {
    const row = await currentDb()
        .selectFrom('jobStatusChange')
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .where('studyJob.id', '=', jobId)
        .where('studyJob.studyId', '=', studyId)
        .where('jobStatusChange.status', '=', 'CODE-SUBMITTED')
        .select('jobStatusChange.createdAt')
        .orderBy('jobStatusChange.createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()
    return row?.createdAt
}

// Rows can exist while the round is still open, and removing a researcher from the lab never
// retroactively unshares.
export async function getSharedFileIdsForJob(jobId: string): Promise<string[]> {
    const rows = await currentDb()
        .selectFrom('studyJobFileRecipientKey')
        .innerJoin('studyJobFile', 'studyJobFile.id', 'studyJobFileRecipientKey.studyJobFileId')
        .where('studyJobFile.studyJobId', '=', jobId)
        .select('studyJobFileRecipientKey.studyJobFileId')
        .distinct()
        .execute()

    return rows.map((r) => r.studyJobFileId)
}
