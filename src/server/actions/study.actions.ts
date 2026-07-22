'use server'

import { db as database, type DBExecutor, jsonArrayFrom } from '@/database'
import { sql } from 'kysely'
import { ActionFailure, isPgUniqueViolation, throwNotFound } from '@/lib/errors'
import { ActionSuccessType, sharedFileSchema, type SharedFile } from '@/lib/types'
import type { StudyStatus } from '@/database/types'
import { countWordsFromLexical, lexicalJson } from '@/lib/lexical'
import { CODE_REVIEW_FEEDBACK_MAX_WORDS, FEEDBACK_MAX_WORDS, FEEDBACK_MIN_WORDS } from '@/lib/proposal-review'
import { toReviewDecision, type Decision } from '@/lib/review-decision'
import { codeReviewFeedbackDocName, reviewFeedbackDocNameForVersion } from '@/lib/collaboration-documents'
import { isCodeUnderReviewStatus, latestCodeChangeIsSubmission } from '@/lib/study-job-status'
import { MAX_SAVE_INTERVAL_MS } from '../../../services/editor/constants'
import { sleep } from '@/lib/utils'
import {
    codeSubmissionVersion,
    currentReviewVersion,
    getProposalFeedbackForStudy,
    getStudyJobFileOfType,
    latestJobForStudy,
    latestJobForStudyOrNull,
    type LatestJobForStudy,
} from '@/server/db/queries'
import { nextVersionForStudyComment } from '@/server/db/mutations'
import { purgeCodeReviewFeedbackYjsDoc, purgeReviewFeedbackYjsDocBeforeAt } from '@/server/db/yjs-cleanup'
import {
    deferred,
    onStudyApproved,
    onStudyCodeApproved,
    onStudyCodeChangesRequested,
    onStudyCodeRejected,
    onStudyNeedsClarification,
    onStudyRejected,
} from '@/server/events'
import { insertSharedFileKeys } from '@/server/results-sharing'
import { triggerBuildImageForJob } from '../aws'
import { SIMULATE_CODE_BUILD } from '../config'
import { bareExtension } from '@/lib/paths'
import { toRecord } from '@/lib/permissions'
import { Action, z } from './action'

// NOT exported, for internal use by actions in this file.
// Soft-delete filter (`deletedAt IS NULL`) is intentionally scoped to dashboard listings via this helper.
// Direct study reads by ID elsewhere — editor polling, agreements/code-review middlewares, getInfoForStudyId —
// stay lifecycle-agnostic. Because soft-delete only applies to DRAFTs and a deleted DRAFT is no longer surfaced
// on any dashboard, the studyId is effectively undiscoverable. Stale editor tabs / direct URL bookmarks remain
// a known gap.
function fetchStudyQuery(db: DBExecutor) {
    return db
        .selectFrom('study')
        .where('study.deletedAt', 'is', null)
        .leftJoin(
            (eb) =>
                eb
                    .selectFrom('studyJob')
                    .select(['studyJob.studyId', 'studyJob.id as jobId', 'studyJob.createdAt as studyJobCreatedAt'])
                    .distinctOn('studyId')
                    .orderBy('studyId')
                    .orderBy('createdAt', 'desc')
                    // id (v7, insertion-ordered) breaks createdAt ties so the per-study job picked
                    // here is deterministic when two jobs share a createdAt (e.g. inserted in one
                    // transaction, where now() is constant). Mirrors latestJobForStudyQuery.
                    .orderBy('studyJob.id', 'desc')
                    .as('latestStudyJob'),
            (join) => join.onRef('latestStudyJob.studyId', '=', 'study.id'),
        )
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['jobStatusChange.status', 'jobStatusChange.userId'])
                    .whereRef('jobStatusChange.studyJobId', '=', 'latestStudyJob.jobId')
                    .orderBy('studyJobId')
                    .orderBy('createdAt', 'desc')
                    .orderBy('jobStatusChange.id', 'desc'),
            ).as('jobStatusChanges'),
            jsonArrayFrom(
                eb
                    .selectFrom('orgDataSource')
                    .select(['orgDataSource.id', 'orgDataSource.name'])
                    .where(sql<boolean>`"org_data_source"."id"::text = ANY("study"."datasets")`),
            ).as('orgDataSources'),
        ])
        .innerJoin('user as researcher', (join) => join.onRef('study.researcherId', '=', 'researcher.id'))
        .leftJoin('user as reviewer', (join) => join.onRef('study.reviewerId', '=', 'reviewer.id'))
        .select([
            'study.id',
            'study.approvedAt',
            'study.rejectedAt',
            'study.containerLocation',
            'study.createdAt',
            'study.submittedAt',
            'study.lastUpdatedAt',
            'study.datasets',
            'study.dataSources',
            'study.irbProtocols',
            'study.orgId',
            'study.submittedByOrgId',
            'study.outputMimeType',
            'study.piName',
            'study.piUserId',
            'study.reviewerId',
            'study.researcherId',
            'study.researchQuestions',
            'study.projectSummary',
            'study.impact',
            'study.additionalNotes',
            'study.status',
            'study.title',
            'study.researcherAgreementsAckedAt',
            'study.reviewerAgreementsAckedAt',
            'study.codeResubmissionNoteDraft',
            'study.proposalResubmissionNoteDraft',
            'researcher.fullName as createdBy',
            'reviewer.fullName as reviewerName',
            'latestStudyJob.jobId as latestStudyJobId',
        ])
        .orderBy('study.lastUpdatedAt', 'desc')
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
    .handler(async ({ db, orgId, orgType }) => {
        let query = fetchStudyQuery(db)
        if (orgType === 'enclave') {
            // Reviewer dashboards should not see draft studies
            query = query.where('study.orgId', '=', orgId).where('study.status', '!=', 'DRAFT')
        }
        if (orgType === 'lab') {
            // Lab dashboards: show every study submitted by the lab (including drafts and
            // change-requested proposals). Multi-user editing means any lab member can
            // continue an in-progress draft authored by a colleague.
            query = query.where('study.submittedByOrgId', '=', orgId)
        }
        return query
            .innerJoin('org as reviewerOrg', 'reviewerOrg.id', 'study.orgId')
            .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
            .select(['reviewerOrg.name as reviewingEnclaveName'])
            .select(['submittingOrg.name as submittingLabName'])
            .execute()
    })

export const fetchStudiesForCurrentResearcherUserAction = new Action('fetchStudiesForCurrentResearcherUserAction')
    .requireAbilityTo('view', 'Studies')
    .handler(async ({ db, session }) => {
        const userId = session.user.id
        return fetchStudyQuery(db)
            .where((eb) => eb.or([eb('study.status', '!=', 'DRAFT'), eb('study.researcherId', '=', userId)])) // Only show: non-draft studies OR drafts where user is the researcher
            .innerJoin('org', 'org.id', 'study.orgId')
            .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
            .select(['org.name as orgName', 'org.slug as orgSlug', 'submittingOrg.slug as submittedByOrgSlug'])
            .execute()
    })

export const fetchStudiesForCurrentReviewerAction = new Action('fetchStudiesForCurrentReviewerAction')
    .requireAbilityTo('view', 'Studies')
    .handler(async ({ db, session }) => {
        const userOrgs = Object.values(session.orgs)
        const reviewerOrgIds = userOrgs.filter((org) => org.type === 'enclave').map((org) => org.id)
        if (reviewerOrgIds.length === 0) {
            return []
        }
        return fetchStudyQuery(db)
            .where('study.orgId', 'in', reviewerOrgIds)
            .where('study.status', '!=', 'DRAFT') // Reviewers should not see draft studies
            .innerJoin('org', 'org.id', 'study.orgId')
            .select(['org.name as orgName', 'org.slug as orgSlug'])
            .execute()
    })

export const getStudyAction = new Action('getStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await fetchStudyQuery(db)
            .where('study.id', '=', studyId)
            .innerJoin('org', 'org.id', 'study.orgId')
            .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
            .select([
                'org.slug as orgSlug',
                'submittingOrg.slug as submittedByOrgSlug',
                'submittingOrg.name as submittingLabName',
                'study.descriptionDocPath',
                'study.irbDocPath',
                'study.agreementDocPath',
                'study.language',
            ])
            .executeTakeFirstOrThrow(throwNotFound('Study'))
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ study }) => {
        return study
    })

export type SelectedStudy = ActionSuccessType<typeof getStudyAction>

export const ackAgreementsAction = new Action('ackAgreementsAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), role: z.enum(['researcher', 'reviewer']) }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['id', 'orgId', 'submittedByOrgId', 'status'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ study, params: { studyId, role }, db, session }) => {
        const userOrgIds = new Set(Object.values(session?.orgs ?? {}).map((org) => org.id))

        // OTTER-546: scope the ack strictly to the role the agreements page was rendered for.
        // A user who happens to belong to BOTH the reviewer enclave and the submitting lab
        // (common in test accounts) would otherwise ack both columns when proceeding from
        // the researcher view, silently consuming the reviewer's gate and skipping the
        // Agreements page on their next visit.
        const requiredOrgId = role === 'reviewer' ? study.orgId : study.submittedByOrgId
        // SI admins (manage/all) can review studies for orgs they don't belong to, so allow the
        // reviewer ack on their behalf — mirroring the ability check the review/agreements pages use.
        // The researcher path stays membership-only, preserving the OTTER-546 dual-member scoping.
        const canReviewStudy = role === 'reviewer' && session.can('review', toRecord('Study', { orgId: study.orgId }))
        if (!userOrgIds.has(requiredOrgId) && !canReviewStudy) {
            throw new ActionFailure({ user: `not a member of the study ${role} org` })
        }

        const column = role === 'reviewer' ? 'reviewerAgreementsAckedAt' : 'researcherAgreementsAckedAt'
        await db
            .updateTable('study')
            .set({ [column]: new Date() })
            .where('id', '=', studyId)
            .where(column, 'is', null)
            .execute()
    })

export const softDeleteStudyAction = new Action('softDeleteStudyAction', { performsMutations: true })
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['id', 'status', 'title', 'researcherId', 'orgId', 'submittedByOrgId'])
            .where('id', '=', studyId)
            .where('deletedAt', 'is', null)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId }
    })
    .requireAbilityTo('delete', 'Study')
    .handler(async ({ db, study, params: { studyId }, session }) => {
        if (study.status !== 'DRAFT') {
            throw new ActionFailure({ study: 'only draft studies can be deleted' })
        }
        if (study.researcherId !== session.user.id) {
            throw new ActionFailure({ user: 'only the draft author can delete this proposal' })
        }
        await db.updateTable('study').set({ deletedAt: new Date() }).where('id', '=', studyId).execute()
        return { title: study.title }
    })

async function approveJobCode({
    db,
    job,
    study,
    userId,
    studyId,
    orgSlug,
    useTestImage,
    sharedFiles,
}: {
    db: DBExecutor
    job: LatestJobForStudy
    study: { orgId: string; containerLocation: string }
    userId: string
    studyId: string
    orgSlug: string
    useTestImage?: boolean
    sharedFiles?: SharedFile[]
}) {
    await db
        .insertInto('jobStatusChange')
        .values({ userId, status: 'CODE-APPROVED', studyJobId: job.id })
        .executeTakeFirstOrThrow()

    if (SIMULATE_CODE_BUILD) {
        await db
            .insertInto('jobStatusChange')
            .values({ userId, status: 'JOB-READY', studyJobId: job.id })
            .executeTakeFirstOrThrow()
    } else {
        const image = await db
            .selectFrom('orgCodeEnv')
            .where('language', '=', job.language)
            .where('orgId', '=', study.orgId)
            .where('isTesting', '=', useTestImage || false)
            .orderBy('orgCodeEnv.createdAt', 'desc')
            .select(['url', 'commandLines'])
            .executeTakeFirstOrThrow(
                throwNotFound(`no code environment found for org ${orgSlug} and language ${job.language}`),
            )

        const mainCode = await getStudyJobFileOfType(job.id, 'MAIN-CODE')
        const ext = bareExtension(mainCode.name)
        const cmdLine = image.commandLines[ext]
        if (!cmdLine) {
            throw new Error(`No command line configured for extension ".${ext}" in code environment`)
        }

        await triggerBuildImageForJob({
            studyJobId: job.id,
            studyId,
            orgSlug,
            containerLocation: study.containerLocation,
            codeEntryPointFileName: mainCode.name,
            cmdLine,
            codeEnvURL: image.url,
        })
    }

    if (sharedFiles?.length) {
        // Re-wrap: persist only the per-researcher wrapped AES keys the reviewer's browser
        // produced. Ciphertext is untouched; no plaintext is stored.
        await insertSharedFileKeys(db, job.id, sharedFiles)
    }
}

type StudyForApproval = { status: StudyStatus; approvedAt: Date | null; orgId: string; containerLocation: string }

async function performStudyProposalApproval({
    db,
    study,
    studyId,
    userId,
    orgSlug,
    useTestImage,
    sharedFiles,
}: {
    db: DBExecutor
    study: StudyForApproval
    studyId: string
    userId: string
    orgSlug: string
    useTestImage?: boolean
    sharedFiles?: SharedFile[]
}) {
    // Proposal approval is strictly the first decision from PENDING-REVIEW; approving a later code
    // (re)submission is submitCodeReviewDecisionAction's job. The PENDING-REVIEW + approvedAt IS NULL
    // predicate is the server-side gate (mirrors claimInitialProposalReviewStudy): it blocks flipping
    // a DRAFT (or any non-pending study) into a viewable status, which would otherwise let a DO
    // reviewer read a draft it was never meant to see (OTTER-596). Atomic so it also settles the
    // OTTER-471 race where two decisions land at once.
    const claimed = await db
        .updateTable('study')
        .set({
            status: 'APPROVED',
            approvedAt: new Date(),
            rejectedAt: null,
            reviewerId: userId,
            lastUpdatedAt: new Date(),
        })
        .where('id', '=', studyId)
        .where('status', '=', 'PENDING-REVIEW')
        .where('approvedAt', 'is', null)
        .returning('id')
        .executeTakeFirst()

    if (!claimed) {
        throw new ActionFailure({ study: 'has already been decided. Refresh to see the updated status.' })
    }

    onStudyApproved({ studyId, userId })

    const latestJob = await db
        .selectFrom('studyJob')
        .select('id')
        .where('studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst()

    if (!latestJob) return

    const job = await latestJobForStudy(studyId)

    await approveJobCode({ db, job, study, userId, studyId, orgSlug, useTestImage, sharedFiles })
}

async function markStudyRejected({ db, studyId, userId }: { db: DBExecutor; studyId: string; userId: string }) {
    // Same PENDING-REVIEW gate as approval: a proposal can only be rejected while it is under review,
    // so a DO reviewer can't flip a DRAFT to REJECTED to make it readable (OTTER-596). Atomic for the
    // OTTER-471 race. Code-stage rejection is a separate path (submitCodeReviewDecisionAction) and does
    // not go through here.
    const claimed = await db
        .updateTable('study')
        .set({
            status: 'REJECTED',
            rejectedAt: new Date(),
            approvedAt: null,
            reviewerId: userId,
            lastUpdatedAt: new Date(),
        })
        .where('id', '=', studyId)
        .where('status', '=', 'PENDING-REVIEW')
        .where('approvedAt', 'is', null)
        .returning('id')
        .executeTakeFirst()

    if (!claimed) {
        throw new ActionFailure({ study: 'has already been decided. Refresh to see the updated status.' })
    }
}

async function performStudyProposalRejection({
    db,
    studyId,
    userId,
}: {
    db: DBExecutor
    studyId: string
    userId: string
}) {
    await markStudyRejected({ db, studyId, userId })
    onStudyRejected({ studyId, userId })
}

async function performStudyCodeRejection({ db, studyId, userId }: { db: DBExecutor; studyId: string; userId: string }) {
    await markStudyRejected({ db, studyId, userId })

    const latestJob = await db
        .selectFrom('studyJob')
        .select('id')
        .where('studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst()

    if (latestJob) {
        await db
            .insertInto('jobStatusChange')
            .values({ userId, status: 'CODE-REJECTED', studyJobId: latestJob.id })
            .executeTakeFirstOrThrow()
        onStudyCodeRejected({ studyId, userId })
    } else {
        onStudyRejected({ studyId, userId })
    }
}

export const approveStudyProposalAction = new Action('approveStudyProposalAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string(),
            orgSlug: z.string(),
            useTestImage: z.boolean().optional(),
            sharedFiles: z.array(sharedFileSchema).optional(),
        }),
    )
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['status', 'approvedAt', 'orgId', 'containerLocation'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { study, orgId: study.orgId }
    })
    .requireAbilityTo('approve', 'Study')
    .handler(async ({ params: { studyId, orgSlug, useTestImage, sharedFiles }, study, session, db }) => {
        await performStudyProposalApproval({
            db,
            study,
            studyId,
            userId: session.user.id,
            orgSlug,
            useTestImage,
            sharedFiles,
        })
    })

export const rejectStudyProposalAction = new Action('rejectStudyProposalAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string(),
            orgSlug: z.string(),
        }),
    )
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['orgId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { study, orgId: study.orgId }
    })
    .requireAbilityTo('reject', 'Study')
    .handler(async ({ params: { studyId }, session, db }) => {
        await performStudyCodeRejection({ db, studyId, userId: session.user.id })
    })

function normalizeFeedbackToLexical(raw: string): { json: string; wordCount: number } {
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        parsed = null
    }

    // Loose check: non-Lexical JSON that passes will yield 0 words and fail min-word validation below.
    const looksLikeLexicalRoot =
        parsed != null &&
        typeof parsed === 'object' &&
        'root' in (parsed as Record<string, unknown>) &&
        typeof (parsed as { root: unknown }).root === 'object'

    const json = looksLikeLexicalRoot ? raw : lexicalJson(raw)
    return { json, wordCount: countWordsFromLexical(json) }
}

async function claimInitialProposalReviewStudy({
    db,
    studyId,
    userId,
}: {
    db: DBExecutor
    studyId: string
    userId: string
}) {
    const study = await db
        .updateTable('study')
        .set({ reviewerId: userId, lastUpdatedAt: new Date() })
        .where('id', '=', studyId)
        .where('status', '=', 'PENDING-REVIEW')
        // approvedAt IS NULL excludes legacy/straggler rows left at PENDING-REVIEW
        // by the retired code-submit status flip; those are code-stage, not
        // proposal-stage, and must not be claimable for a proposal review.
        .where('approvedAt', 'is', null)
        .returning(['status', 'approvedAt', 'orgId', 'containerLocation'])
        .executeTakeFirst()

    if (!study) {
        // OTTER-471: race-loser when a peer tab/user already submitted a decision.
        // User-facing wording — surfaces via errorToString → reportMutationError toast.
        throw new ActionFailure({
            study: 'has already been decided. Refresh to see the updated status.',
        })
    }

    return study
}

async function insertReviewerProposalComment({
    db,
    studyId,
    userId,
    decision,
    body,
}: {
    db: DBExecutor
    studyId: string
    userId: string
    decision: Decision
    body: string
}) {
    await db
        .insertInto('studyProposalComment')
        .values({
            studyId,
            authorId: userId,
            authorRole: 'REVIEWER',
            entryType: 'REVIEWER-FEEDBACK',
            decision: toReviewDecision(decision),
            body: JSON.parse(body),
            version: nextVersionForStudyComment({ studyId, increment: false }),
        })
        .executeTakeFirstOrThrow()
}

// Safety-net delete: an in-tx DELETE inside the action handles the common case,
// but a Hocuspocus debounced persist for the review-feedback doc can still
// commit between the management-app status flip and our in-tx delete (different
// connections, READ COMMITTED snapshots). Wait long enough for any in-flight
// persist to land, then re-delete the row only when its updatedAt predates the
// captured submit timestamp. The bound preserves rows from a fast clarification
// -> reopen cycle that lands inside the 5-second window.
const purgeReviewFeedbackYjsDocAfterSubmit = deferred(
    async (args: { studyId: string; version: number; beforeAt: Date }) => {
        await sleep({ 5: 'seconds' })
        await purgeReviewFeedbackYjsDocBeforeAt(database, args)
    },
)

export const submitProposalReviewAction = new Action('submitProposalReviewAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string(),
            orgSlug: z.string(),
            feedback: z.string(),
            decision: z.enum(['approve', 'needs-clarification', 'reject']),
            // Editable review round the client believed it was on at submit
            // time. Recomputed server-side and validated against the current
            // value so a stale tab can't write into the wrong round even if
            // the editor-service gates somehow let it past.
            reviewVersion: z.number().int().positive(),
        }),
    )
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['orgId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId }
    })
    .requireAbilityTo('review', 'Study')
    .handler(async ({ params: { studyId, orgSlug, feedback, decision, reviewVersion }, session, db }) => {
        const userId = session.user.id
        const { json, wordCount } = normalizeFeedbackToLexical(feedback)

        if (wordCount < FEEDBACK_MIN_WORDS) {
            throw new ActionFailure({ feedback: 'Feedback is required' })
        }
        if (wordCount > FEEDBACK_MAX_WORDS) {
            throw new ActionFailure({
                feedback: `Feedback must be ${FEEDBACK_MAX_WORDS} words or fewer (got ${wordCount})`,
            })
        }

        const expectedVersion = await currentReviewVersion(studyId)
        if (reviewVersion !== expectedVersion) {
            throw new ActionFailure({
                review: `stale review round ${reviewVersion} (current ${expectedVersion})`,
            })
        }

        const submittedAt = new Date()
        const claimedStudy = await claimInitialProposalReviewStudy({ db, studyId, userId })
        await insertReviewerProposalComment({ db, studyId, userId, decision, body: json })

        const submitter = await db
            .selectFrom('user')
            .select(['fullName'])
            .where('id', '=', userId)
            .executeTakeFirstOrThrow()

        // Drop the versioned review-feedback yjs_document so the next round
        // (if any) starts fresh from its own `-v${N+1}` name. The deferred
        // follow-up below catches any Hocuspocus persist that commits between
        // status-flip and now.
        await db
            .deleteFrom('yjsDocument')
            .where('name', '=', reviewFeedbackDocNameForVersion(studyId, reviewVersion))
            .execute()

        if (decision === 'approve') {
            await performStudyProposalApproval({ db, study: claimedStudy, studyId, userId, orgSlug })
            purgeReviewFeedbackYjsDocAfterSubmit({ studyId, version: reviewVersion, beforeAt: submittedAt })
            return { submitterFullName: submitter.fullName }
        }

        if (decision === 'reject') {
            await performStudyProposalRejection({ db, studyId, userId })
            purgeReviewFeedbackYjsDocAfterSubmit({ studyId, version: reviewVersion, beforeAt: submittedAt })
            return { submitterFullName: submitter.fullName }
        }

        // Clarification requests only change the proposal status. Job status rows are reserved for code review.
        await db
            .updateTable('study')
            .set({
                status: 'CHANGE-REQUESTED',
                reviewerId: userId,
                approvedAt: null,
                rejectedAt: null,
                lastUpdatedAt: new Date(),
            })
            .where('id', '=', studyId)
            .execute()

        onStudyNeedsClarification({ studyId, userId })
        purgeReviewFeedbackYjsDocAfterSubmit({ studyId, version: reviewVersion, beforeAt: submittedAt })
        return { submitterFullName: submitter.fullName }
    })

export const getProposalFeedbackForStudyAction = new Action('getProposalFeedbackForStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => {
        const { study, entries } = await getProposalFeedbackForStudy(studyId)
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status, entries }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ entries }) => entries)

export type ProposalFeedbackEntry = ActionSuccessType<typeof getProposalFeedbackForStudyAction>[number]

// Same safety-net rationale as purgeReviewFeedbackYjsDocAfterSubmit, but for the
// code-review-feedback document. A debounced Hocuspocus persist can race the
// in-tx delete on a different connection, so wait long enough for any in-flight
// persist to land and re-delete only rows older than the captured submit time.
// Safety-net: after the in-tx delete commits, a debounced Hocuspocus persist
// from a stale connected client can still upsert a row at the job-keyed name
// (the editor no longer gates code-review writes; the action is the single
// enforcer). The delay must outlast Hocuspocus's MAX_SAVE_INTERVAL_MS (30s) so
// the sweep runs *after* the worst-case debounced/maxDebounce store fires, and
// after the disconnect-flush (which is also routed through the same debouncer
// per the Hocuspocus 3.4.x server). Job-keyed names are never legitimately
// re-used after submit, so unconditional delete is safe.
const CODE_REVIEW_PURGE_DELAY_MS = MAX_SAVE_INTERVAL_MS + 5_000
const purgeCodeReviewFeedbackYjsDocAfterSubmit = deferred(async (args: { jobId: string }) => {
    await sleep({ [CODE_REVIEW_PURGE_DELAY_MS]: 'ms' })
    await purgeCodeReviewFeedbackYjsDoc(database, args)
})

async function claimInitialCodeReviewJob({ studyId }: { studyId: string }) {
    // Code-review eligibility is driven by the JOB status alone, not study.status.
    // PENDING-REVIEW is a proposal-stage status; a study whose proposal was already
    // approved stays APPROVED while its code is (re)submitted for review, so a latest
    // job whose newest code change is a fresh submission is the only correct gate. Once a
    // peer decides the current submission this gate fails (the newest code change is a
    // decision, not a submission), and within the same round the unique
    // (studyJobId, reviewKind, round) index blocks a true insert race — so this check is
    // also the race-loser guard (OTTER-471). latestCodeChangeIsSubmission counts submissions
    // vs decisions rather than reading statusChanges[0], so it is immune to the
    // createdAt/v7-id tie ordering this file leans on being non-deterministic elsewhere.
    const job = await latestJobForStudyOrNull(studyId)
    if (!job || !job.statusChanges.some((c) => isCodeUnderReviewStatus(c.status))) {
        throw new ActionFailure({ study: 'has no code submission to review.' })
    }
    if (!latestCodeChangeIsSubmission(job.statusChanges)) {
        throw new ActionFailure({
            study: 'has already been decided. Refresh to see the updated status.',
        })
    }
    return job
}

const codeReviewCriteriaSchema = z.object({
    proposalAlignment: z.enum(['yes', 'no', 'not-sure']),
    agreementCompliance: z.enum(['yes', 'no', 'not-sure']),
    securityChecks: z.enum(['yes', 'no', 'not-sure']),
    privacyProtection: z.enum(['yes', 'no', 'not-sure']),
})

export const submitCodeReviewDecisionAction = new Action('submitCodeReviewDecisionAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string().uuid(),
            orgSlug: z.string(),
            feedback: z.string(),
            decision: z.enum(['approve', 'needs-clarification', 'reject']),
            criteria: codeReviewCriteriaSchema,
        }),
    )
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['orgId', 'status', 'approvedAt', 'containerLocation'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { study, orgId: study.orgId }
    })
    .requireAbilityTo('review', 'Study')
    .handler(async ({ params: { studyId, orgSlug, feedback, decision, criteria }, study, session, db }) => {
        const userId = session.user.id

        const { json, wordCount } = normalizeFeedbackToLexical(feedback)
        if (wordCount < FEEDBACK_MIN_WORDS) {
            throw new ActionFailure({ feedback: 'Feedback is required' })
        }
        if (wordCount > CODE_REVIEW_FEEDBACK_MAX_WORDS) {
            throw new ActionFailure({
                feedback: `Feedback must be ${CODE_REVIEW_FEEDBACK_MAX_WORDS} words or fewer (got ${wordCount})`,
            })
        }

        const claimedJob = await claimInitialCodeReviewJob({ studyId })

        // Round = study-wide submission version at decision time. A same-job resubmit (OTTER-316)
        // keeps the same job, so uniqueness is scoped to (studyJobId, reviewKind, round) and each
        // round gets its own decision row (OTTER-638). The round-1 decision is written before its
        // CODE-CHANGES-REQUESTED status below, so round 1 → 1 and a post-resubmit decision → 2.
        // Load-bearing: codeSubmissionVersion counts CODE-CHANGES-REQUESTED/FILES-APPROVED/FILES-REJECTED
        // but NOT CODE-REJECTED, which is safe only because reject is terminal (not resubmittable) so no
        // second decision can follow it. If reject ever becomes resubmittable, codeSubmissionVersion
        // must count it too (and canResearcherResubmitCode must allow it), or the round won't advance and the
        // next decision would collide on the round-scoped unique constraint.
        const round = await codeSubmissionVersion(studyId, db)

        try {
            await db
                .insertInto('studyReviewComment')
                .values({
                    studyId,
                    studyJobId: claimedJob.id,
                    authorId: userId,
                    reviewKind: 'CODE',
                    entryType: 'DECISION',
                    decision: toReviewDecision(decision),
                    body: JSON.parse(json),
                    criteria,
                    round,
                })
                .executeTakeFirstOrThrow()
        } catch (err) {
            // Postgres unique_violation (SQLSTATE 23505). The composite unique
            // index on (studyJobId, reviewKind, round) fires when two reviewers
            // race through claimInitialCodeReviewJob within the same round and
            // both reach this insert before either commits. The race-loser sees
            // this; the data is already safe, so surface a clean message instead
            // of the raw duplicate-key error.
            if (isPgUniqueViolation(err)) {
                throw new ActionFailure({
                    study: 'another reviewer has already submitted a decision for this study code',
                })
            }
            throw err
        }

        const submitter = await db
            .selectFrom('user')
            .select(['fullName'])
            .where('id', '=', userId)
            .executeTakeFirstOrThrow()

        await db.deleteFrom('yjsDocument').where('name', '=', codeReviewFeedbackDocName(claimedJob.id)).execute()

        // Each branch below re-asserts the APPROVED resting state. Code submission
        // no longer flips study.status, so these writes are transitional
        // self-healing for legacy rows (and old pods during a rolling deploy) that
        // still sit at PENDING-REVIEW with approvedAt set; once those are gone they
        // can shrink to { reviewerId, lastUpdatedAt }.
        if (decision === 'approve') {
            await approveJobCode({ db, job: claimedJob, study, userId, studyId, orgSlug })
            await db
                .updateTable('study')
                .set({ status: 'APPROVED', rejectedAt: null, reviewerId: userId, lastUpdatedAt: new Date() })
                .where('id', '=', studyId)
                .execute()
            onStudyCodeApproved({ studyId, userId })
        } else if (decision === 'reject') {
            // Rejecting code only fails the job, not the proposal. Record
            // CODE-REJECTED on the job and keep the study APPROVED so the
            // proposal page keeps showing "approved" (OTTER-603). The study
            // was already approved (approvedAt set) before code was reviewed.
            await db
                .insertInto('jobStatusChange')
                .values({ userId, status: 'CODE-REJECTED', studyJobId: claimedJob.id })
                .executeTakeFirstOrThrow()
            await db
                .updateTable('study')
                .set({ status: 'APPROVED', rejectedAt: null, reviewerId: userId, lastUpdatedAt: new Date() })
                .where('id', '=', studyId)
                .execute()
            onStudyCodeRejected({ studyId, userId })
        } else {
            // Clarification: append CODE-CHANGES-REQUESTED on the job (so the
            // pill flips to "Change requested"). The proposal stays APPROVED;
            // claimInitialCodeReviewJob's job-status gate blocks any further
            // code-review submissions on this job until the researcher resubmits.
            await db
                .insertInto('jobStatusChange')
                .values({ userId, status: 'CODE-CHANGES-REQUESTED', studyJobId: claimedJob.id })
                .executeTakeFirstOrThrow()
            await db
                .updateTable('study')
                .set({ status: 'APPROVED', rejectedAt: null, reviewerId: userId, lastUpdatedAt: new Date() })
                .where('id', '=', studyId)
                .execute()
            onStudyCodeChangesRequested({ studyId, userId })
        }

        purgeCodeReviewFeedbackYjsDocAfterSubmit({ jobId: claimedJob.id })

        return { submitterFullName: submitter.fullName }
    })

export const getCodeReviewFeedbackAction = new Action('getCodeReviewFeedbackAction')
    .params(z.object({ studyId: z.string().uuid() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['orgId', 'submittedByOrgId', 'status'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId }, db }) => {
        // Both reviewer decisions and resubmission notes are versioned by the study-wide submission
        // round (see codeSubmissionVersion): the decision stores it in studyReviewComment.round, the
        // note in studyJob.resubmissionRound. This keeps a round's note and decision on the same
        // label even when a same-job resubmit revises in place (OTTER-316/638) and the job ordinal
        // would not advance. jobVersion (job creation order) is only a fallback for legacy rows whose
        // resubmissionRound was not backfilled. studyJob has no userId column; the author of the
        // resubmission note is the user recorded on the job's latest CODE-SUBMITTED (left-joined so
        // the timestamp and author are independent: a null/deleted user does not lose the submission
        // row). A same-job resubmit appends more than one CODE-SUBMITTED, so joining the rows directly
        // would multiply the job into duplicate codeJobs rows (and duplicate note entries); a lateral
        // join to the single latest submission keeps each job to one row.
        const codeJobs = await db
            .selectFrom('studyJob')
            .leftJoinLateral(
                (eb) =>
                    eb
                        .selectFrom('jobStatusChange as cs')
                        .leftJoin('user as submitter', 'submitter.id', 'cs.userId')
                        .select([
                            'cs.userId as authorId',
                            'submitter.fullName as authorName',
                            'cs.createdAt as submittedAt',
                        ])
                        .whereRef('cs.studyJobId', '=', 'studyJob.id')
                        .where('cs.status', '=', 'CODE-SUBMITTED')
                        .orderBy('cs.createdAt', 'desc')
                        .orderBy('cs.id', 'desc')
                        .limit(1)
                        .as('latestSubmission'),
                (join) => join.onTrue(),
            )
            .select([
                'studyJob.id as studyJobId',
                'studyJob.resubmissionNote',
                'studyJob.resubmissionRound',
                'studyJob.createdAt',
                'latestSubmission.authorId',
                'latestSubmission.authorName',
                'latestSubmission.submittedAt',
            ])
            .where('studyJob.studyId', '=', studyId)
            .orderBy('studyJob.createdAt', 'asc')
            .execute()

        const jobVersion = new Map(codeJobs.map((j, i) => [j.studyJobId, i + 1]))

        const reviewerRows = await db
            .selectFrom('studyReviewComment')
            .innerJoin('user as author', 'author.id', 'studyReviewComment.authorId')
            .select([
                'studyReviewComment.id',
                'studyReviewComment.authorId',
                'studyReviewComment.entryType',
                'studyReviewComment.decision',
                'studyReviewComment.body',
                'studyReviewComment.criteria',
                'studyReviewComment.createdAt',
                'studyReviewComment.round',
                'author.fullName as authorName',
            ])
            .where('studyReviewComment.studyId', '=', studyId)
            .where('studyReviewComment.reviewKind', '=', 'CODE')
            .where('studyReviewComment.entryType', '=', 'DECISION')
            .execute()

        const reviewerEntries = reviewerRows.map((row) => ({
            id: row.id,
            authorId: row.authorId,
            entryType: 'REVIEWER-FEEDBACK' as const,
            decision: row.decision,
            body: row.body,
            criteria: row.criteria,
            createdAt: row.createdAt,
            authorName: row.authorName,
            version: row.round ?? null,
        }))

        const noteEntries = codeJobs
            .filter((j) => j.resubmissionNote != null)
            .map((j) => ({
                id: `job-note-${j.studyJobId}`,
                authorId: j.authorId ?? '',
                entryType: 'RESUBMISSION-NOTE' as const,
                decision: null,
                body: j.resubmissionNote as NonNullable<typeof j.resubmissionNote>,
                criteria: null,
                // The note is written at resubmit time, not job creation: a same-job resubmit revises
                // an old job in place, so use the latest CODE-SUBMITTED timestamp to position the note
                // in the round it opened (newest-first sort below). Falls back to job creation only for
                // a job with no submission (which never carries a note).
                createdAt: j.submittedAt ?? j.createdAt,
                authorName: j.authorName ?? '',
                version: j.resubmissionRound ?? jobVersion.get(j.studyJobId) ?? null,
            }))

        return [...reviewerEntries, ...noteEntries].sort((a, b) => {
            const createdAtDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            if (createdAtDiff !== 0) return createdAtDiff

            const versionDiff = (b.version ?? 0) - (a.version ?? 0)
            if (versionDiff !== 0) return versionDiff

            const entryTypeDiff = a.entryType.localeCompare(b.entryType)
            if (entryTypeDiff !== 0) return entryTypeDiff

            return a.id.localeCompare(b.id)
        })
    })

export type CodeReviewFeedbackEntry = ActionSuccessType<typeof getCodeReviewFeedbackAction>[number]

export const doesTestImageExistForStudyAction = new Action('doesTestImageExistForStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => {
        const latestJob = await latestJobForStudy(studyId)
        return { latestJob, orgId: latestJob.orgId }
    })
    .requireAbilityTo('approve', 'Study')
    .handler(async ({ latestJob, db }) => {
        const testImage = await db
            .selectFrom('orgCodeEnv')
            .select('id')
            .where('orgId', '=', latestJob.orgId)
            .where('language', '=', latestJob.language)
            .where('isTesting', '=', true)
            .executeTakeFirst()

        return !!testImage
    })
