import { type Expression } from 'kysely'
import { type DBExecutor } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { currentDb } from '@/server/request-context'
import { StudyJobStatus } from '@/database/types'
import {
    CODE_DECISION_JOB_STATUSES,
    CODE_ROUND_CLOSING_JOB_STATUSES,
    ROUND_CLOSING_JOB_STATUSES,
} from '@/lib/study-job-status'

// A study id, or a reference to the outer query's study.id for a correlated subquery.
type StudyIdOperand = string | Expression<string>

// Counted across ALL jobs: a per-job count would reset to v1 after a results decision opens a fresh
// job, hiding prior rounds' feedback (OTTER-556/558). CODE-REJECTED is omitted because reject is
// terminal; if it becomes resubmittable, count it here and in canResearcherResubmitCode (OTTER-638).
export const codeSubmissionVersion = async (studyId: string, db: DBExecutor): Promise<number> => {
    const row = await db
        .selectFrom('jobStatusChange')
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .where('studyJob.studyId', '=', studyId)
        .where('jobStatusChange.status', 'in', CODE_ROUND_CLOSING_JOB_STATUSES)
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst()
    return Number(row?.count ?? 0) + 1
}

// Outputs reviews run on their own sequence: a study can be on code round 3 and still be on its
// first outputs decision, which used to label that decision v3.0 (OTTER-766). Counts the decisions
// rather than FILES-* rows, because older rejections wrote the status with no comment and counting
// them would leave the first visible entry labeled v2.0 with no v1.0 anywhere.
// Count and insert are separate, and the unique constraint backing them is per job, so a caller that
// writes the counted round must lock the study row first (see submitOutputsDecisionAction).
export const outputsDecisionVersion = async (studyId: string, db: DBExecutor): Promise<number> => {
    const row = await db
        .selectFrom('studyReviewComment')
        .where('studyId', '=', studyId)
        .where('reviewKind', '=', 'RESULTS')
        .where('entryType', '=', 'DECISION')
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst()
    return Number(row?.count ?? 0) + 1
}

// max(version) rather than ordering by createdAt so simultaneous reviewer submissions cannot
// tie-break wrong.
export const currentReviewVersion = async (studyId: string): Promise<number> => {
    const row = await currentDb()
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
        currentDb()
            .selectFrom('study')
            .select(['orgId', 'submittedByOrgId', 'status'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study')),
        currentDb()
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

// Users who wrote one of `statuses` on any job of the study; enclave run statuses have no user.
function jobStatusUserIds(db: DBExecutor, studyId: StudyIdOperand, statuses: readonly StudyJobStatus[]) {
    return db
        .selectFrom('jobStatusChange')
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .select((eb) => eb.ref('jobStatusChange.userId').$notNull().as('userId'))
        .where('studyJob.studyId', '=', studyId)
        .where('jobStatusChange.status', 'in', statuses)
        .where('jobStatusChange.userId', 'is not', null)
}

// The lab members on a study, shared by My studies and the lab emails: the creator, the PI, and anyone who
// submitted a version of the proposal or, with withCodeSubmitters, the code. A PI without an account is left out.
export function studyLabMemberIds(db: DBExecutor, studyId: StudyIdOperand, { withCodeSubmitters = true } = {}) {
    // researcherId is only the draft's creator. Any lab member can submit or re-finalize it, recorded only
    // by onStudyProposalSubmitted's CREATED audit row; an edit-and-resubmit is recorded only by its note's author.
    // Aliased so a correlated `study.id` still names the outer row, not this one.
    const proposalMembers = db
        .selectFrom('study as memberStudy')
        .select('memberStudy.researcherId as userId')
        .where('memberStudy.id', '=', studyId)
        .union(
            db
                .selectFrom('study as memberStudy')
                .select((eb) => eb.ref('memberStudy.piUserId').$notNull().as('userId'))
                .where('memberStudy.id', '=', studyId)
                .where('memberStudy.piUserId', 'is not', null),
        )
        .union(
            db
                .selectFrom('audit')
                .select('userId')
                .where('recordType', '=', 'STUDY')
                .where('recordId', '=', studyId)
                .where('eventType', '=', 'CREATED'),
        )
        .union(
            db
                .selectFrom('studyProposalComment')
                .select('authorId as userId')
                .where('studyId', '=', studyId)
                .where('entryType', '=', 'RESUBMISSION-NOTE'),
        )
    return withCodeSubmitters
        ? proposalMembers.union(jobStatusUserIds(db, studyId, ['CODE-SUBMITTED']))
        : proposalMembers
}

// Everyone who decided on a version of the proposal, plus the code and outputs deciders when asked,
// shared by My studies and the Data Partner emails. Code decisions come from job statuses because
// studyReviewComment has no rows for decisions made before it existed.
export function studyDeciderIds(
    db: DBExecutor,
    studyId: StudyIdOperand,
    { withCodeDeciders = true, withOutputsDeciders = true } = {},
) {
    let deciders = db
        .selectFrom('studyProposalComment')
        .select('authorId as userId')
        .where('studyId', '=', studyId)
        .where('entryType', '=', 'REVIEWER-FEEDBACK')
        .where('decision', 'is not', null)
    if (withCodeDeciders) {
        deciders = deciders.union(jobStatusUserIds(db, studyId, CODE_DECISION_JOB_STATUSES))
    }
    if (withOutputsDeciders) {
        deciders = deciders.union(jobStatusUserIds(db, studyId, ROUND_CLOSING_JOB_STATUSES))
    }
    return deciders
}

// Some callers come from the API, which lacks a user; do not use siUser inside this.
export const getStudyAndOrgDisplayInfo = async (studyId: string) => {
    const res = await currentDb()
        .selectFrom('study')
        .innerJoin('user as researcher', 'study.researcherId', 'researcher.id')
        .leftJoin('user as reviewer', 'study.reviewerId', 'reviewer.id')
        .innerJoin('org', 'org.id', 'study.orgId')
        .innerJoin('org as lab', 'lab.id', 'study.submittedByOrgId')
        .select([
            'study.orgId',
            'study.researcherId',
            'study.piUserId',
            'study.title',
            'study.isTestStudy',
            'reviewer.email as reviewerEmail',
            'reviewer.fullName as reviewerFullName',
            'researcher.email as researcherEmail',
            'researcher.fullName as researcherFullName',
            'org.slug as orgSlug',
            'org.name as orgName',
            // Lab-audience emails link through the lab's slug; `orgSlug` is the Data Partner's.
            'lab.slug as labSlug',
            'lab.name as labName',
            'study.createdAt',
            'study.submittedAt',
        ])
        .where('study.id', '=', studyId)
        .executeTakeFirstOrThrow(() => new Error('Study & Org not found'))

    if (!res) throw new Error('Study & Org not found')

    return res
}

/**
 * OTTER-817: the Coder account a workspace is provisioned under is the researcher who claimed the
 * IDE, not whoever submitted the proposal. currentDb() is load-bearing: ensureWorkspaceAction claims
 * ideOwnerId inside its transaction and reads it back through here before the commit.
 *
 * Null covers both "no such study" and "unclaimed": by the time any Coder code runs, requireIdeOwner
 * has already passed, so either one is equally a bug.
 */
export const getIdeOwnerForStudy = async (studyId: string) => {
    const owner = await currentDb()
        .selectFrom('study')
        .innerJoin('user as ideOwner', 'ideOwner.id', 'study.ideOwnerId')
        .select(['ideOwner.id as userId', 'ideOwner.email', 'ideOwner.fullName'])
        .where('study.id', '=', studyId)
        .executeTakeFirst()

    return owner ?? null
}

const studyInfoQuery = (studyId: string) =>
    currentDb()
        .selectFrom('study')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select([
            'study.id as studyId',
            'orgId',
            'org.slug as orgSlug',
            'study.researcherId',
            'study.status',
            'study.submittedByOrgId',
            // This output becomes the ability subject, which requireAbilityTo serializes into
            // permission_denied, so a title selected here would leak to a guessed study id (MA-6).
        ])
        .where('study.id', '=', studyId)

type StudyInfo = Awaited<ReturnType<ReturnType<typeof studyInfoQuery>['executeTakeFirstOrThrow']>>

export async function getInfoForStudyId(studyId: string, throwIfNotFound?: true): Promise<StudyInfo>
export async function getInfoForStudyId(studyId: string, throwIfNotFound: false): Promise<StudyInfo | undefined>
export async function getInfoForStudyId(studyId: string, throwIfNotFound = true): Promise<StudyInfo | undefined> {
    const query = studyInfoQuery(studyId)
    return throwIfNotFound ? await query.executeTakeFirstOrThrow() : await query.executeTakeFirst()
}
