import { type DBExecutor, jsonArrayFrom } from '@/database'
import { currentUser as currentClerkUser, type User as ClerkUser } from '@clerk/nextjs/server'
import { ActionSuccessType } from '@/lib/types'
import { AccessDeniedError, throwNotFound } from '@/lib/errors'
import { wasCalledFromAPI } from '../api-context'
import { findOrCreateSiUserId } from './mutations'
import { FileType, StudyJobFileAction } from '@/database/types'
import { JOB_FAILURE_REASONS } from '@/lib/job-error-details'
import { latestCodeSubmittedAt, reviewForCurrentRound } from '@/lib/study-job-status'
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

export const getUserPublicKey = async (userId: string) => {
    // user_public_key has a unique constraint on user_id, so there is at most one row per user.
    const result = await Action.db
        .selectFrom('userPublicKey')
        .select(['userPublicKey.fingerprint', 'userPublicKey.publicKey', 'userPublicKey.updatedAt'])
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

    const row = await Action.db
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

// Counted across ALL jobs: a per-job count would reset to v1 after a results decision opens a fresh
// job, hiding prior rounds' feedback (OTTER-556/558).
export const codeSubmissionVersion = async (studyId: string, db: DBExecutor = Action.db): Promise<number> => {
    const row = await db
        .selectFrom('jobStatusChange')
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .where('studyJob.studyId', '=', studyId)
        .where('jobStatusChange.status', 'in', ['CODE-CHANGES-REQUESTED', 'FILES-APPROVED', 'FILES-REJECTED'])
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst()
    return Number(row?.count ?? 0) + 1
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
            'study.status',
        ])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirstOrThrow()
}

// max(version) rather than ordering by createdAt so simultaneous reviewer submissions cannot
// tie-break wrong.
export const currentReviewVersion = async (studyId: string): Promise<number> => {
    const row = await Action.db
        .selectFrom('studyProposalComment')
        .select((eb) => eb.fn.max('version').as('version'))
        .where('studyId', '=', studyId)
        .executeTakeFirst()
    return row?.version ?? 1
}

export const upcomingResubmissionNoteVersion = async (studyId: string): Promise<number> =>
    (await currentReviewVersion(studyId)) + 1

export const getProposalFeedbackForStudy = async (studyId: string) => {
    const [study, entries] = await Promise.all([
        Action.db
            .selectFrom('study')
            .select(['orgId', 'submittedByOrgId', 'status'])
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
            'study.status',
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

// Some callers come from the API, which lacks a user; do not use siUser inside this.
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

// executeTakeFirst, NOT ...OrThrow: an unknown slug must leave orgId ABSENT from the CASL subject so
// the mongo $in conditions fail CLOSED. Throwing would distinguish "no such org" from "not yours".
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
        .select([
            'org.id as orgId',
            'org.slug as orgSlug',
            'study.id as studyId',
            'study.submittedByOrgId',
            'study.status',
        ])
        .where('studyJob.id', '=', studyJobId)
        .executeTakeFirstOrThrow()
}

export const getInfoForStudyId = async (studyId: string) => {
    return await Action.db
        .selectFrom('study')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select([
            'orgId',
            'org.slug as orgSlug',
            'study.researcherId',
            'study.status',
            'study.submittedByOrgId',
            // This output becomes the ability subject, which requireAbilityTo serializes into
            // permission_denied, so a title selected here would leak to a guessed study id (MA-6).
        ])
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
        // A resubmission can leave more than one row of a given type for a job; take the newest.
        .orderBy('studyJobFile.createdAt', 'desc')
        .orderBy('studyJobFile.id', 'desc')
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

export async function getOrgIdForJobId(jobId: string) {
    const job = await Action.db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .where('studyJob.id', '=', jobId)
        .select(['study.orgId'])
        .executeTakeFirst()

    return job?.orgId
}

export async function getOrgPublicKeysRaw(orgId: string) {
    return await Action.db
        .selectFrom('orgUser')
        .innerJoin('userPublicKey', 'userPublicKey.userId', 'orgUser.userId')
        .select(['userPublicKey.publicKey', 'userPublicKey.fingerprint'])
        .where('orgUser.orgId', '=', orgId)
        .execute()
}

export async function getOrgPublicKeys(orgId: string): Promise<PublicKey[]> {
    const keys = await getOrgPublicKeysRaw(orgId)
    return keys.map(({ publicKey, fingerprint }) => {
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

export async function getLabPublicKeysForJob(jobId: string): Promise<PublicKey[]> {
    const { submittedByOrgId } = await labOrgIdForJob(jobId)
    return getOrgPublicKeys(submittedByOrgId)
}

export async function getLabPublicKeysForStudy(studyId: string): Promise<PublicKey[]> {
    const { submittedByOrgId } = await Action.db
        .selectFrom('study')
        .select('submittedByOrgId')
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow(throwNotFound(`study ${studyId}`))
    return getOrgPublicKeys(submittedByOrgId)
}

// Most recent view/download per output file. DISTINCT ON collapses each file to its newest row
// because the column reports the latest action, not a history (OTTER-675).
export type JobFileActivity = {
    studyJobFileId: string
    filePath: string
    action: StudyJobFileAction
    createdAt: Date
    actorName: string
}

export async function latestActivityPerJobFile(jobId: string): Promise<JobFileActivity[]> {
    return await Action.db
        .selectFrom('studyJobFileActivity')
        .innerJoin('studyJobFile', 'studyJobFile.id', 'studyJobFileActivity.studyJobFileId')
        .innerJoin('user', 'user.id', 'studyJobFileActivity.userId')
        .where('studyJobFile.studyJobId', '=', jobId)
        .select([
            'studyJobFileActivity.studyJobFileId',
            'studyJobFileActivity.filePath',
            'studyJobFileActivity.action',
            'studyJobFileActivity.createdAt',
            'user.fullName as actorName',
        ])
        .distinctOn(['studyJobFileActivity.studyJobFileId', 'studyJobFileActivity.filePath'])
        .orderBy('studyJobFileActivity.studyJobFileId')
        .orderBy('studyJobFileActivity.filePath')
        .orderBy('studyJobFileActivity.createdAt', 'desc')
        .orderBy('studyJobFileActivity.id', 'desc')
        .execute()
}

// Rows can exist while the round is still open, and removing a researcher from the lab never
// retroactively unshares.
export async function getSharedFileIdsForJob(jobId: string): Promise<string[]> {
    const rows = await Action.db
        .selectFrom('studyJobFileRecipientKey')
        .innerJoin('studyJobFile', 'studyJobFile.id', 'studyJobFileRecipientKey.studyJobFileId')
        .where('studyJobFile.studyJobId', '=', jobId)
        .select('studyJobFileRecipientKey.studyJobFileId')
        .distinct()
        .execute()

    return rows.map((r) => r.studyJobFileId)
}

export type StudyReviewWithMeta = {
    // null on a failure row (summaryFailedAt set) — generation produced no report.
    report: AnalysisReport | null
    createdAt: Date
    summaryFailedAt: Date | null
    files: { name: string; fileType: FileType }[]
}

// PASSED only on an explicit clean signal. INDETERMINATE covers "reported, but no verdict": Trivy
// has no R analyzer, so a successful scan of an R submission clears nothing (OTTER-649).
export type ScanToolStatus = 'PASSED' | 'FAILED' | 'INDETERMINATE'

export type JobScanResult = {
    // null when the scan hasn't reported yet (no readable plaintext log).
    trivy: ScanToolStatus | null
    sonarqube: ScanToolStatus | null
    // Present only when a downloadable plaintext scan log exists (ZIPs are not offered).
    logFile: { id: string; name: string; path: string } | null
}

// Unrecognized text is indeterminate, not FAILED: treating it as FAILED surfaced a scan that never
// ran as a vulnerability finding. A Map, not an object literal, so `constructor` cannot look truthy.
const TRIVY_VERDICTS = new Map<string, ScanToolStatus>([
    ['no vulnerabilities found', 'PASSED'],
    ['vulnerabilities found', 'FAILED'],
])

const TRIVY_STATUS_LINE = /^trivy (?:filesystem|image) scan:/i
const TRIVY_LEGACY_FINDINGS_HEADER = /^trivy (?:filesystem|image) scan results$/i

// Anchored to a whole trimmed line: a scanned path or CVE title containing the header phrase would
// otherwise decide the verdict.
export function parseTrivyStatus(log: string): ScanToolStatus {
    const lines = log.split('\n').map((line) => line.trim())

    const statusLine = lines.find((line) => TRIVY_STATUS_LINE.test(line))
    if (statusLine) {
        const phrase = statusLine.replace(TRIVY_STATUS_LINE, '').trim().toLowerCase()
        return TRIVY_VERDICTS.get(phrase) ?? 'INDETERMINATE'
    }

    // Logs predating the status phrase headed findings with this label.
    if (lines.some((line) => TRIVY_LEGACY_FINDINGS_HEADER.test(line))) return 'FAILED'
    return 'INDETERMINATE'
}

// Anything but an OK quality gate means human review, so there is deliberately no INDETERMINATE.
export function parseSonarqubeStatus(log: string): ScanToolStatus {
    const match = log.match(/sonarqube quality gate:\s*(\S+)/i)
    return match?.[1]?.toUpperCase() === 'OK' ? 'PASSED' : 'FAILED'
}

// No log row yet, or an unreadable file, is treated as "not reported".
export async function jobScanResultForJob(studyJobId: string): Promise<JobScanResult> {
    const logFile = await Action.db
        .selectFrom('studyJobFile')
        .select(['id', 'name', 'path'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', '=', 'SECURITY-SCAN-LOG')
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .limit(1)
        .executeTakeFirst()

    if (!logFile) return { trivy: null, sonarqube: null, logFile: null }

    try {
        const blob = await fetchFileContents(logFile.path)
        const contents = await blob.text()
        return { trivy: parseTrivyStatus(contents), sonarqube: parseSonarqubeStatus(contents), logFile }
    } catch {
        // The download route serves the file from the DB row + a signed URL, so keep it available
        // with unknown statuses rather than pretending the scan is pending.
        return { trivy: null, sonarqube: null, logFile }
    }
}

// The round rule needs the job's submission history, so the job is the argument rather than a bare
// id: passing both let a caller pair one job's id with another's statuses (OTTER-775). The id key
// differs by query — getStudyJobInfo aliases it to studyJobId — so either spelling is accepted.
export type JobForRound = {
    createdAt: Date | string
    statusChanges: ReadonlyArray<{ status: string; createdAt: Date | string }>
} & ({ id: string } | { studyJobId: string })

const jobRowId = (job: JobForRound) => ('id' in job ? job.id : job.studyJobId)

export async function getStudyReviewForJob(job: JobForRound): Promise<StudyReviewWithMeta | null> {
    const studyJobId = jobRowId(job)
    const row = await Action.db
        .selectFrom('studyReview')
        .select((eb) => [
            eb.ref('report').$castTo<AnalysisReport | null>().as('report'),
            'createdAt',
            'summaryFailedAt',
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

    if (!row) return null

    return reviewForCurrentRound(row, latestCodeSubmittedAt(job))
}

export type JobAnalysis = { review: StudyReviewWithMeta | null; scan: JobScanResult }

// The summary and the scan always travel together — both server renders of the code section and the
// poll that keeps it current need the pair — so they are fetched as one thing.
export async function jobAnalysisForJob(job: JobForRound): Promise<JobAnalysis> {
    const [review, scan] = await Promise.all([getStudyReviewForJob(job), jobScanResultForJob(jobRowId(job))])
    return { review, scan }
}
