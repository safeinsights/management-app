'use server'

import { type DBExecutor } from '@/database'
import { sql, type ExpressionBuilder } from 'kysely'
import type { DB, OrgType, StudyJobStatus } from '@/database/types'
import {
    CODE_REVIEW_FEEDBACK_PREFIX,
    OUTPUTS_REVIEW_FEEDBACK_PREFIX,
    PROPOSAL_PREFIX,
    REVIEW_FEEDBACK_PREFIX,
} from '@/lib/collaboration-documents'
import type { StudyRole } from '@/lib/study-screen/state.types'
import { isStudyUnread } from '@/lib/study-screen/dashboard-raw-state'
import type { StudyRow } from '@/lib/study-screen/dashboard-row.types'
import { CODE_DECISION_JOB_STATUSES, ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'
import { enclaveOrgIds, labOrgIds } from '@/lib/utils'
import { fetchStudyQuery, studyDeciderIds, studyLabMemberIds } from '@/server/db/queries'
import { Action, z } from './action'

// Newest saved Yjs edit among the documents whose names start with one of `prefixes`.
const yjsEditedAtSql = (prefixes: string[]) =>
    sql<Date | null>`(
        select max("yjs_document"."updated_at") from "yjs_document"
        where "yjs_document"."study_id" = "study"."id"
          and "yjs_document"."name" like any(${prefixes.map((prefix) => `${prefix}%`)}::text[])
    )`

// Each side's Last updated counts only its own unshared edits (OTTER-617); status changes are
// added on the client from the badge history.
const ownEditsAtSql = (audience: StudyRole) =>
    audience === 'researcher'
        ? sql<Date | null>`greatest("study"."lab_edited_at", ${yjsEditedAtSql([PROPOSAL_PREFIX])})`
        : yjsEditedAtSql([REVIEW_FEEDBACK_PREFIX, CODE_REVIEW_FEEDBACK_PREFIX, OUTPUTS_REVIEW_FEEDBACK_PREFIX])

// The proposal submitter is not stored; the audit row finalize writes is the only trace. It is
// deferred, so it lands just after submitted_at; the slack absorbs app/DB clock skew, and taking
// the earliest skips CREATED rows that code submission writes later.
const PROPOSAL_AUDIT_SKEW = sql`interval '5 seconds'`

function fetchDashboardStudyQuery(db: DBExecutor, audience: StudyRole, userId: string) {
    return fetchStudyQuery(db)
        .leftJoin('studyLastOpened', (join) =>
            join.onRef('studyLastOpened.studyId', '=', 'study.id').on('studyLastOpened.userId', '=', userId),
        )
        .leftJoinLateral(
            (eb) =>
                eb
                    .selectFrom('audit')
                    .innerJoin('user as auditUser', 'auditUser.id', 'audit.userId')
                    .select(['auditUser.fullName as name', 'audit.createdAt as at'])
                    .where('audit.recordType', '=', 'STUDY')
                    .where('audit.eventType', '=', 'CREATED')
                    .whereRef('audit.recordId', '=', 'study.id')
                    .where(
                        sql<boolean>`("study"."submitted_at" is null or "audit"."created_at" >= "study"."submitted_at" - ${PROPOSAL_AUDIT_SKEW})`,
                    )
                    .orderBy('audit.createdAt')
                    .orderBy('audit.id')
                    .limit(1)
                    .as('proposalAudit'),
            (join) => join.onTrue(),
        )
        .leftJoinLateral(
            (eb) =>
                eb
                    .selectFrom('studyProposalComment')
                    .innerJoin('user as noteAuthor', 'noteAuthor.id', 'studyProposalComment.authorId')
                    .select(['noteAuthor.fullName as name', 'studyProposalComment.createdAt as at'])
                    .whereRef('studyProposalComment.studyId', '=', 'study.id')
                    .where('studyProposalComment.entryType', '=', 'RESUBMISSION-NOTE')
                    .orderBy('studyProposalComment.createdAt', 'desc')
                    .orderBy('studyProposalComment.id', 'desc')
                    .limit(1)
                    .as('proposalResubmission'),
            (join) => join.onTrue(),
        )
        .leftJoinLateral(
            (eb) =>
                eb
                    .selectFrom('studyProposalComment')
                    .innerJoin('user as proposalDecider', 'proposalDecider.id', 'studyProposalComment.authorId')
                    .select(['proposalDecider.fullName as name', 'studyProposalComment.createdAt as at'])
                    .whereRef('studyProposalComment.studyId', '=', 'study.id')
                    .where('studyProposalComment.entryType', '=', 'REVIEWER-FEEDBACK')
                    .orderBy('studyProposalComment.createdAt', 'desc')
                    .orderBy('studyProposalComment.id', 'desc')
                    .limit(1)
                    .as('proposalReview'),
            (join) => join.onTrue(),
        )
        .leftJoinLateral(
            (eb) => jobStageActors(eb).as('jobStages'),
            (join) => join.onTrue(),
        )
        .select([
            'proposalAudit.name as proposalAuditName',
            'proposalAudit.at as proposalAuditAt',
            'proposalResubmission.name as proposalResubmitterName',
            'proposalResubmission.at as proposalResubmittedAt',
            'jobStages.codeSubmitterName',
            'jobStages.codeSubmittedAt',
            'proposalReview.name as proposalReviewerName',
            'proposalReview.at as proposalReviewedAt',
            'jobStages.codeReviewerName',
            'jobStages.codeReviewedAt',
            'jobStages.outputsReviewerName',
            'jobStages.outputsReviewedAt',
            'studyLastOpened.openedAt as lastOpenedAt',
        ])
        .select(ownEditsAtSql(audience).as('ownEditsAt'))
}

const CODE_SUBMISSION_JOB_STATUSES: readonly StudyJobStatus[] = ['CODE-SUBMITTED']

// Who wrote the newest job status of each stage, and when, in one pass over the study's job history.
function jobStageActors(eb: ExpressionBuilder<DB, 'study'>) {
    const inStatuses = (statuses: readonly StudyJobStatus[]) =>
        sql`"job_status_change"."status" in (${sql.join(statuses)})`
    const newestActor = (statuses: readonly StudyJobStatus[]) =>
        sql<
            string | null
        >`(array_agg("actor"."full_name" order by "job_status_change"."created_at" desc, "job_status_change"."id" desc) filter (where ${inStatuses(statuses)}))[1]`
    const newestAt = (statuses: readonly StudyJobStatus[]) =>
        sql<Date | null>`max("job_status_change"."created_at") filter (where ${inStatuses(statuses)})`
    return eb
        .selectFrom('jobStatusChange')
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .innerJoin('user as actor', 'actor.id', 'jobStatusChange.userId')
        .whereRef('studyJob.studyId', '=', 'study.id')
        .where('jobStatusChange.status', 'in', [
            ...CODE_SUBMISSION_JOB_STATUSES,
            ...CODE_DECISION_JOB_STATUSES,
            ...ROUND_CLOSING_JOB_STATUSES,
        ])
        .select([
            newestActor(CODE_SUBMISSION_JOB_STATUSES).as('codeSubmitterName'),
            newestAt(CODE_SUBMISSION_JOB_STATUSES).as('codeSubmittedAt'),
            newestActor(CODE_DECISION_JOB_STATUSES).as('codeReviewerName'),
            newestAt(CODE_DECISION_JOB_STATUSES).as('codeReviewedAt'),
            newestActor(ROUND_CLOSING_JOB_STATUSES).as('outputsReviewerName'),
            newestAt(ROUND_CLOSING_JOB_STATUSES).as('outputsReviewedAt'),
        ])
}

const audienceForOrg = (orgType: OrgType): StudyRole => (orgType === 'enclave' ? 'reviewer' : 'researcher')

function orgDashboardStudies(db: DBExecutor, orgId: string, orgType: OrgType, userId: string) {
    let query = fetchDashboardStudyQuery(db, audienceForOrg(orgType), userId)
    if (orgType === 'enclave') {
        query = query.where('study.orgId', '=', orgId).where('study.status', '!=', 'DRAFT')
    }
    if (orgType === 'lab') {
        query = query.where('study.submittedByOrgId', '=', orgId)
    }
    return query
        .innerJoin('org as reviewerOrg', 'reviewerOrg.id', 'study.orgId')
        .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
        .select(['reviewerOrg.name as reviewingEnclaveName'])
        .select(['submittingOrg.name as submittingLabName'])
        .execute()
}

// My studies is a personal record: studies the user is named on (creator, PI) or submitted a
// version of, within their own labs.
async function researcherMyStudies(db: DBExecutor, userId: string, labIds: string[]) {
    if (labIds.length === 0) {
        return []
    }
    return fetchDashboardStudyQuery(db, 'researcher', userId)
        .where('study.submittedByOrgId', 'in', labIds)
        .where((eb) => eb(eb.val(userId), 'in', studyLabMemberIds(db, eb.ref('study.id'))))
        .innerJoin('org', 'org.id', 'study.orgId')
        .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
        .select([
            'org.name as orgName',
            'org.slug as orgSlug',
            'submittingOrg.name as submittingLabName',
            'submittingOrg.slug as submittedByOrgSlug',
        ])
        .execute()
}

async function reviewerMyStudies(db: DBExecutor, userId: string, reviewerOrgIds: string[]) {
    if (reviewerOrgIds.length === 0) {
        return []
    }
    // Only studies the user decided on, at any stage of any round; reviewerId covers decisions
    // made before decisions were recorded per stage.
    return fetchDashboardStudyQuery(db, 'reviewer', userId)
        .where('study.orgId', 'in', reviewerOrgIds)
        .where('study.status', '!=', 'DRAFT')
        .where((eb) =>
            eb.or([
                eb('study.reviewerId', '=', userId),
                eb(eb.val(userId), 'in', studyDeciderIds(db, eb.ref('study.id'))),
            ]),
        )
        .innerJoin('org', 'org.id', 'study.orgId')
        .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
        .select([
            'org.name as orgName',
            'org.slug as orgSlug',
            'submittingOrg.name as submittingLabName',
            'submittingOrg.slug as submittedByOrgSlug',
        ])
        .execute()
}

export const fetchStudiesForOrgAction = new Action('fetchStudiesForOrgAction')
    .params(z.object({ orgSlug: z.string() }))
    .middleware(
        async ({ params: { orgSlug }, db }) =>
            await db
                .selectFrom('org')
                .select(['id as orgId', 'type as orgType'])
                .where('slug', '=', orgSlug)
                .executeTakeFirst(),
    )
    .requireAbilityTo('view', 'OrgStudies')
    .handler(async ({ db, session, orgId, orgType }) => orgDashboardStudies(db, orgId, orgType, session.user.id))

export const fetchStudiesForCurrentResearcherUserAction = new Action('fetchStudiesForCurrentResearcherUserAction')
    .requireAbilityTo('view', 'Studies')
    .handler(async ({ db, session }) => researcherMyStudies(db, session.user.id, labOrgIds(session)))

export const fetchStudiesForCurrentReviewerAction = new Action('fetchStudiesForCurrentReviewerAction')
    .requireAbilityTo('view', 'Studies')
    .handler(async ({ db, session }) => reviewerMyStudies(db, session.user.id, enclaveOrgIds(session)))

const anyUnread = (rows: unknown[], audience: StudyRole) =>
    (rows as StudyRow[]).some((row) => isStudyUnread(row, audience))

// Runs the same queries and the same Last updated rule as the tables, so a nav dot never points at
// a scope whose rows all read as opened (OTTER-838).
export const fetchNavUnreadAction = new Action('fetchNavUnreadAction')
    .requireAbilityTo('view', 'Studies')
    .handler(async ({ db, session }) => {
        const userId = session.user.id
        const [researcherRows, reviewerRows, orgs] = await Promise.all([
            researcherMyStudies(db, userId, labOrgIds(session)),
            reviewerMyStudies(db, userId, enclaveOrgIds(session)),
            Promise.all(
                Object.values(session.orgs).map(async (org) => ({
                    slug: org.slug,
                    isUnread: anyUnread(
                        await orgDashboardStudies(db, org.id, org.type, userId),
                        audienceForOrg(org.type),
                    ),
                })),
            ),
        ])
        return {
            myStudies: {
                researcher: anyUnread(researcherRows, 'researcher'),
                reviewer: anyUnread(reviewerRows, 'reviewer'),
            },
            orgSlugs: orgs.filter((org) => org.isUnread).map((org) => org.slug),
        }
    })
