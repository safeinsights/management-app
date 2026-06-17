import { type DBExecutor, jsonArrayFrom } from '@/database'
import { currentUser as currentClerkUser, type User as ClerkUser } from '@clerk/nextjs/server'
import { ActionSuccessType } from '@/lib/types'
import { AccessDeniedError, throwNotFound } from '@/lib/errors'
import { wasCalledFromAPI } from '../api-context'
import { findOrCreateSiUserId } from './mutations'
import { FileType } from '@/database/types'
import { Selectable } from 'kysely'
import { Action } from '../actions/action'
import { fetchFileContents } from '@/server/storage'
import type { PublicKey } from 'si-encryption/job-results/types'
import type { AnalysisReport } from '@/server/agents/review-agent/types'

export type SiUser = ClerkUser & {
    id: string
}

export async function siUser(throwIfNotFound?: true): Promise<SiUser>
export async function siUser(throwIfNotFound?: false): Promise<SiUser | null>
export async function siUser(throwIfNotFound = true): Promise<SiUser | null> {
    const clerkUser = wasCalledFromAPI() ? null : await currentClerkUser()
    if (!clerkUser || clerkUser.banned) {
        if (throwIfNotFound) throw new AccessDeniedError({ user: 'was not found' })
        return null
    }

    const userId = await findOrCreateSiUserId(clerkUser.id, clerkUser)
    return {
        ...clerkUser,
        id: userId,
    } as SiUser
}

export async function getStudyJobInfo(studyJobId: string) {
    return await Action.db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'study.orgId', 'org.id')
        .select((eb) => [
            'studyJob.id as studyJobId',
            'studyJob.studyId',
            'studyJob.createdAt',
            'study.title as studyTitle',
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

export const getUserPublicKey = async (userId: string) => {
    const result = await Action.db
        .selectFrom('userPublicKey')
        .select(['userPublicKey.fingerprint', 'userPublicKey.publicKey'])
        .where('userPublicKey.userId', '=', userId)
        .executeTakeFirst()

    return result
}

export type LatestJobForStudy = ActionSuccessType<typeof latestJobForStudy>

function latestJobForStudyQuery(studyId: string) {
    return Action.db
        .selectFrom('studyJob')
        .selectAll('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .select(['study.orgId', 'study.language'])
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

// The latest job that has reached a real submission (any status beyond the initial INITIATED).
// A study opens a fresh job when work on a new round begins (IDE launch / file upload after a
// closed round); until that round is submitted its job is INITIATED-only. Reviewer/researcher
// routing that must anchor on the *submitted* code uses this, not the raw latest job, so an
// in-progress new round doesn't mask the submission still under review or showing results.
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

// 1 = first submission, >=2 = resubmission round.
export const countSubmittedJobsForStudy = async (studyId: string): Promise<number> => {
    const row = await Action.db
        .selectFrom('studyJob')
        .where('studyJob.studyId', '=', studyId)
        .where((eb) =>
            eb.exists(
                eb
                    .selectFrom('jobStatusChange')
                    .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                    .where('jobStatusChange.status', '=', 'CODE-SUBMITTED')
                    .select('jobStatusChange.id'),
            ),
        )
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst()
    return Number(row?.count ?? 0)
}

export const jobInfoForJobId = async (jobId: string) => {
    return await Action.db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select([
            'studyId',
            'studyJob.id as studyJobId',
            'org.slug as orgSlug',
            'org.id as orgId',
            'study.submittedByOrgId',
        ])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirstOrThrow()
}

/**
 * Current editable review round for a study.
 *
 * Reads `max(studyProposalComment.version)` for the study, mirroring how
 * `nextVersionForStudyComment` (mutations.ts) writes: reviewer feedback
 * inherits the latest version, RESUBMISSION-NOTE increments it. Using
 * `max(version)` rather than ordering by createdAt is tie-immune (multiple
 * reviewers submitting at the same millisecond share a version, and a
 * resubmit's version is always strictly greater than every preceding row).
 *
 * Returns 1 when no comments exist yet (cold round 1 before any reviewer
 * feedback or resubmission note has been written).
 */
export const currentReviewVersion = async (studyId: string): Promise<number> => {
    const row = await Action.db
        .selectFrom('studyProposalComment')
        .select((eb) => eb.fn.max('version').as('version'))
        .where('studyId', '=', studyId)
        .executeTakeFirst()
    return row?.version ?? 1
}

export const getProposalFeedbackForStudy = async (studyId: string) => {
    const [study, entries] = await Promise.all([
        Action.db
            .selectFrom('study')
            .select(['orgId', 'submittedByOrgId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study')),
        Action.db
            .selectFrom('studyProposalComment')
            .innerJoin('user as author', 'author.id', 'studyProposalComment.authorId')
            .select([
                'studyProposalComment.id',
                'studyProposalComment.authorId',
                'studyProposalComment.authorRole',
                'studyProposalComment.entryType',
                'studyProposalComment.decision',
                'studyProposalComment.body',
                'studyProposalComment.createdAt',
                'studyProposalComment.version',
                'author.fullName as authorName',
            ])
            .where('studyProposalComment.studyId', '=', studyId)
            .orderBy('studyProposalComment.createdAt', 'desc')
            .execute(),
    ])

    return { study, entries }
}

export const studyInfoForStudyId = async (studyId: string) => {
    return await Action.db
        .selectFrom('study')
        .innerJoin('org', 'study.orgId', 'org.id')
        .select([
            'study.id as studyId',
            'org.id as orgId',
            'org.slug as orgSlug',
            'study.submittedByOrgId',
            'study.language',
        ])
        .where('study.id', '=', studyId)
        .executeTakeFirst()
}

export const getDataSourcesForOrg = async (orgId: string) => {
    return Action.db
        .selectFrom('orgDataSource')
        .select((eb) => [
            'orgDataSource.id',
            'orgDataSource.name',
            'orgDataSource.description',
            jsonArrayFrom(
                eb
                    .selectFrom('orgDataSourceUrl')
                    .select(['orgDataSourceUrl.url', 'orgDataSourceUrl.description'])
                    .whereRef('orgDataSourceUrl.orgDataSourceId', '=', 'orgDataSource.id')
                    .orderBy('orgDataSourceUrl.createdAt', 'asc'),
            ).as('urls'),
        ])
        .where('orgDataSource.orgId', '=', orgId)
        .orderBy('orgDataSource.createdAt', 'asc')
        .execute()
}

export const getUsersForOrgId = async (orgId: string) => {
    return Action.db
        .selectFrom('user')
        .innerJoin('orgUser', 'user.id', 'orgUser.userId')
        .distinctOn('user.id')
        .select(['user.id', 'user.email', 'user.fullName'])
        .where('orgUser.orgId', '=', orgId)
        .execute()
}

// this is called primarily by the mail functions to get study information
// some of these functions are called by API, which lacks a user, do not use siUser inside this
export const getStudyAndOrgDisplayInfo = async (studyId: string) => {
    const res = await Action.db
        .selectFrom('study')
        .innerJoin('user as researcher', 'study.researcherId', 'researcher.id')
        .leftJoin('user as reviewer', 'study.reviewerId', 'reviewer.id')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select([
            'study.orgId',
            'study.researcherId',
            'study.title',
            'reviewer.email as reviewerEmail',
            'reviewer.fullName as reviewerFullName',
            'researcher.email as researcherEmail',
            'researcher.fullName as researcherFullName',
            'org.slug as orgSlug',
            'org.name as orgName',
            'study.createdAt',
        ])
        .where('study.id', '=', studyId)
        .executeTakeFirstOrThrow(() => new Error('Study & Org not found'))

    if (!res) throw new Error('Study & Org not found')

    return res
}

export const getUserById = async (userId: string) => {
    return await Action.db.selectFrom('user').selectAll('user').where('id', '=', userId).executeTakeFirstOrThrow()
}

export const orgIdFromSlug = async ({ db, params: { orgSlug } }: { db: DBExecutor; params: { orgSlug: string } }) =>
    await db.selectFrom('org').select(['id as orgId', 'type as orgType']).where('slug', '=', orgSlug).executeTakeFirst()

export const getOrgNameFromId = async (orgId: string) => {
    const result = await Action.db.selectFrom('org').select('name').where('id', '=', orgId).executeTakeFirstOrThrow()
    return result.name
}

export const getOrgInfoForUserId = async (userId: string) => {
    const orgs = await Action.db
        .selectFrom('orgUser')
        .innerJoin('org', 'org.id', 'orgUser.orgId')
        .select(['org.id', 'org.slug', 'org.type', 'isAdmin'])
        .where('userId', '=', userId)
        .execute()

    return orgs
}

export const getInfoForStudyJobId = async (studyJobId: string) => {
    return await Action.db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select(['org.id as orgId', 'org.slug as orgSlug', 'study.id as studyId', 'study.submittedByOrgId'])
        .where('studyJob.id', '=', studyJobId)
        .executeTakeFirstOrThrow()
}

export const getInfoForStudyId = async (studyId: string) => {
    return await Action.db
        .selectFrom('study')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select(['orgId', 'org.slug as orgSlug', 'study.researcherId', 'study.status', 'study.submittedByOrgId'])
        .where('study.id', '=', studyId)
        .executeTakeFirstOrThrow()
}

export const getOrgIdFromSlug = async ({ orgSlug }: { orgSlug: string }) => {
    return Action.db
        .selectFrom('org')
        .select(['org.id as orgId', 'org.slug as orgSlug'])
        .where('slug', '=', orgSlug)
        .executeTakeFirstOrThrow()
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
    const file = await Action.db
        .selectFrom('studyJobFile')
        .innerJoin('studyJob', 'studyJob.id', 'studyJobFile.studyJobId')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .select(['studyJobFile.id', 'studyJobFile.name', 'studyJobFile.path', 'study.orgId', 'study.submittedByOrgId'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', '=', fileType)
        .executeTakeFirst()

    if (!file && throwIfNotFound) {
        throw new Error(`File of type ${fileType} not found for study job ${studyJobId}`)
    }
    return file
}

export async function fetchLatestCodeEnvForStudyId(studyId: string) {
    return await Action.db
        .selectFrom('study')
        .innerJoin('orgCodeEnv', (join) =>
            join.onRef('orgCodeEnv.orgId', '=', 'study.orgId').onRef('orgCodeEnv.language', '=', 'study.language'),
        )
        .innerJoin('org', 'org.id', 'study.orgId')
        .where('study.id', '=', studyId)
        .where('orgCodeEnv.isTesting', '=', false)
        .orderBy('orgCodeEnv.createdAt', 'desc')
        .limit(1)
        .select([
            'orgCodeEnv.id',
            'orgCodeEnv.identifier',
            'orgCodeEnv.language',
            'orgCodeEnv.dataSourceType',
            'orgCodeEnv.url',
            'orgCodeEnv.settings',
            'orgCodeEnv.starterCodeFileNames',
            'orgCodeEnv.sampleDataPath',
            'org.slug',
            'study.orgId',
        ])
        .executeTakeFirstOrThrow(() => new Error(`no code environment found for studyId: ${studyId}`))
}

export async function fetchLatestCodeEnvForStudyIdOrNull(studyId: string) {
    try {
        return await fetchLatestCodeEnvForStudyId(studyId)
    } catch {
        return null
    }
}

/**
 * Gets the orgId for a given jobId.
 * Returns undefined if job doesn't exist.
 */
export async function getOrgIdForJobId(jobId: string) {
    const job = await Action.db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .where('studyJob.id', '=', jobId)
        .select(['study.orgId'])
        .executeTakeFirst()

    return job?.orgId
}

/**
 * Fetches all public keys for users belonging to an organization.
 * Returns keys with Buffer format (as stored in DB).
 */
export async function getOrgPublicKeysRaw(orgId: string) {
    return await Action.db
        .selectFrom('orgUser')
        .innerJoin('userPublicKey', 'userPublicKey.userId', 'orgUser.userId')
        .select(['userPublicKey.publicKey', 'userPublicKey.fingerprint'])
        .where('orgUser.orgId', '=', orgId)
        .execute()
}

/**
 * Fetches all public keys for users belonging to an organization.
 * Returns keys converted to si-encryption (ArrayBuffer) format.
 */
export async function getOrgPublicKeys(orgId: string): Promise<PublicKey[]> {
    const keys = await getOrgPublicKeysRaw(orgId)
    return keys.map(({ publicKey, fingerprint }) => {
        // Safe Buffer to ArrayBuffer conversion (handles offset/length correctly)
        const arrayBuffer = new ArrayBuffer(publicKey.byteLength)
        new Uint8Array(arrayBuffer).set(publicKey)
        return { publicKey: arrayBuffer, fingerprint }
    })
}

const labOrgIdForJob = async (jobId: string) =>
    await Action.db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .select('study.submittedByOrgId')
        .where('studyJob.id', '=', jobId)
        .executeTakeFirstOrThrow(throwNotFound(`job ${jobId}`))

// Public keys of the lab org that submitted the study — the researchers a reviewer re-wraps for.
export async function getLabPublicKeysForJob(jobId: string): Promise<PublicKey[]> {
    const { submittedByOrgId } = await labOrgIdForJob(jobId)
    return getOrgPublicKeys(submittedByOrgId)
}

// Same lab keys, resolved from the study id — used by the client approve flow.
export async function getLabPublicKeysForStudy(studyId: string): Promise<PublicKey[]> {
    const { submittedByOrgId } = await Action.db
        .selectFrom('study')
        .select('submittedByOrgId')
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow(throwNotFound(`study ${studyId}`))
    return getOrgPublicKeys(submittedByOrgId)
}

// IDs of this job's artifacts with at least one re-wrapped key row — i.e. shared with researchers.
// Empty before approval (rows only exist post-approval). Removing a researcher from the lab leaves
// their key rows, so this never retroactively un-shares.
export async function getSharedFileIdsForJob(jobId: string): Promise<string[]> {
    const rows = await Action.db
        .selectFrom('studyJobFileKey')
        .innerJoin('studyJobFile', 'studyJobFile.id', 'studyJobFileKey.studyJobFileId')
        .where('studyJobFile.studyJobId', '=', jobId)
        .select('studyJobFileKey.studyJobFileId')
        .distinct()
        .execute()

    return rows.map((r) => r.studyJobFileId)
}

export type StudyReviewWithMeta = {
    report: AnalysisReport
    createdAt: Date
    files: { name: string; fileType: FileType }[]
}

export type JobScanStatus = 'PASSED' | 'FAILED' | 'IN-PROGRESS'

export type JobScanResult = {
    status: JobScanStatus
    logFile: { id: string; name: string; path: string } | null
}

// Per @nathanstitt: there's no clear-cut success/failure signal in the tools, so
// the first-pass heuristic is to read the scan log and check for 'OK'. If the
// log row doesn't exist yet (or the file can't be read), treat as in-progress.
export async function jobScanResultForJob(studyJobId: string): Promise<JobScanResult> {
    const logFile = await Action.db
        .selectFrom('studyJobFile')
        .select(['id', 'name', 'path'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', '=', 'ENCRYPTED-SECURITY-SCAN-LOG')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()

    if (!logFile) return { status: 'IN-PROGRESS', logFile: null }

    try {
        const blob = await fetchFileContents(logFile.path)
        const contents = await blob.text()
        return { status: contents.includes('OK') ? 'PASSED' : 'FAILED', logFile }
    } catch {
        return { status: 'IN-PROGRESS', logFile }
    }
}

export async function getStudyReviewForJob(studyJobId: string): Promise<StudyReviewWithMeta | null> {
    const row = await Action.db
        .selectFrom('studyReview')
        .select((eb) => [
            eb.ref('report').$castTo<AnalysisReport>().as('report'),
            'createdAt',
            jsonArrayFrom(
                eb
                    .selectFrom('studyJobFile')
                    .select(['name', 'fileType'])
                    .whereRef('studyJobFile.studyJobId', '=', 'studyReview.studyJobId')
                    .where('fileType', 'in', ['MAIN-CODE', 'SUPPLEMENTAL-CODE'])
                    .orderBy('fileType', 'desc')
                    .orderBy('name', 'asc'),
            ).as('files'),
        ])
        .where('studyJobId', '=', studyJobId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()

    return row ?? null
}
