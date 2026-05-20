'use server'

import { db as database, type DBExecutor, jsonArrayFrom } from '@/database'
import { sql } from 'kysely'
import { ActionFailure, isPgUniqueViolation, throwNotFound } from '@/lib/errors'
import { ActionSuccessType, jobFileSchema } from '@/lib/types'
import type { StudyStatus } from '@/database/types'
import { countWordsFromLexical, lexicalJson } from '@/lib/lexical'
import { CODE_REVIEW_FEEDBACK_MAX_WORDS, FEEDBACK_MAX_WORDS, FEEDBACK_MIN_WORDS } from '@/lib/proposal-review'
import { toReviewDecision, type Decision } from '@/lib/review-decision'
import { codeReviewFeedbackDocName, reviewFeedbackDocNameForVersion } from '@/lib/collaboration-documents'
import { REVIEWABLE_CODE_JOB_STATUSES } from '@/lib/code-review-status'
import { MAX_SAVE_INTERVAL_MS } from '../../../services/editor/constants'
import { sleep } from '@/lib/utils'
import {
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
import { storeApprovedJobFile } from '@/server/storage'
import { triggerBuildImageForJob } from '../aws'
import { SIMULATE_CODE_BUILD } from '../config'
import { bareExtension } from '@/lib/paths'
import { Action, z } from './action'

// NOT exported, for internal use by actions in this file
function fetchStudyQuery(db: DBExecutor) {
    return db
        .selectFrom('study')
        .leftJoin(
            // Subquery to get the most recent study job for each study
            (eb) =>
                eb
                    .selectFrom('studyJob')
                    .select(['studyJob.studyId', 'studyJob.id as jobId', 'studyJob.createdAt as studyJobCreatedAt'])
                    .distinctOn('studyId')
                    .orderBy('studyId')
                    .orderBy('createdAt', 'desc')
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
            'researcher.fullName as createdBy',
            'reviewer.fullName as reviewerName',
            'latestStudyJob.jobId as latestStudyJobId',
        ])

        .orderBy(sql`coalesce(study.submitted_at, study.created_at)`, 'desc')
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
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId }
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
            .select(['id', 'orgId', 'submittedByOrgId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId }
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
        if (!userOrgIds.has(requiredOrgId)) {
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

async function approveJobCode({
    db,
    job,
    study,
    userId,
    studyId,
    orgSlug,
    useTestImage,
    jobFiles,
}: {
    db: DBExecutor
    job: LatestJobForStudy
    study: { orgId: string; containerLocation: string }
    userId: string
    studyId: string
    orgSlug: string
    useTestImage?: boolean
    jobFiles?: z.infer<typeof jobFileSchema>[]
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

    if (jobFiles?.length) {
        const info = { studyId, studyJobId: job.id, orgSlug }
        for (const jobFile of jobFiles) {
            const file = new File([jobFile.contents], jobFile.path)
            await storeApprovedJobFile(info, file, jobFile.fileType, jobFile.sourceId)
        }
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
    jobFiles,
}: {
    db: DBExecutor
    study: StudyForApproval
    studyId: string
    userId: string
    orgSlug: string
    useTestImage?: boolean
    jobFiles?: z.infer<typeof jobFileSchema>[]
}) {
    const isFirstApproval = study.status !== 'APPROVED' && !study.approvedAt
    const isCodeReapproval = !isFirstApproval

    if (isFirstApproval) {
        await db
            .updateTable('study')
            .set({ status: 'APPROVED', approvedAt: new Date(), rejectedAt: null, reviewerId: userId })
            .where('id', '=', studyId)
            .execute()

        onStudyApproved({ studyId, userId })
    }

    const latestJob = await db
        .selectFrom('studyJob')
        .select('id')
        .where('studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst()

    if (!latestJob) return

    const job = await latestJobForStudy(studyId)
    const latestJobStatus = job.statusChanges.at(0)?.status

    if (isCodeReapproval) {
        if (latestJobStatus !== 'CODE-SCANNED' && latestJobStatus !== 'CODE-SUBMITTED') return
    }

    await approveJobCode({ db, job, study, userId, studyId, orgSlug, useTestImage, jobFiles })

    // Restore APPROVED status after code re-approval when study went back to PENDING-REVIEW
    if (isCodeReapproval && study.status === 'PENDING-REVIEW') {
        await db
            .updateTable('study')
            .set({ status: 'APPROVED', rejectedAt: null, reviewerId: userId })
            .where('id', '=', studyId)
            .execute()

        onStudyCodeApproved({ studyId, userId })
    }
}

async function markStudyRejected({ db, studyId, userId }: { db: DBExecutor; studyId: string; userId: string }) {
    await db
        .updateTable('study')
        .set({ status: 'REJECTED', rejectedAt: new Date(), approvedAt: null, reviewerId: userId })
        .where('id', '=', studyId)
        .execute()
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
            jobFiles: z.array(jobFileSchema).optional(),
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
    .handler(async ({ params: { studyId, orgSlug, useTestImage, jobFiles }, study, session, db }) => {
        await performStudyProposalApproval({
            db,
            study,
            studyId,
            userId: session.user.id,
            orgSlug,
            useTestImage,
            jobFiles,
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
        .set({ reviewerId: userId })
        .where('id', '=', studyId)
        .where('status', '=', 'PENDING-REVIEW')
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
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, entries }
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

async function claimInitialCodeReviewJob({ db, studyId }: { db: DBExecutor; studyId: string }) {
    // Mirror the editor auth gate: code review requires both PENDING-REVIEW
    // study status and a job whose latest status is CODE-SUBMITTED/CODE-SCANNED.
    // Without the study-status check, a stale APPROVED study with a fresh
    // CODE-SUBMITTED job would slip through (the job-status check alone would pass).
    const study = await db
        .selectFrom('study')
        .select('status')
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow(throwNotFound('study'))
    if (study.status !== 'PENDING-REVIEW') {
        // OTTER-471: race-loser when a peer already submitted a code decision
        // (post-submit the study flips out of PENDING-REVIEW).
        throw new ActionFailure({
            study: 'has already been decided. Refresh to see the updated status.',
        })
    }

    const job = await latestJobForStudyOrNull(studyId)
    const latestStatus = job?.statusChanges.at(0)?.status
    if (!job || !latestStatus) {
        throw new ActionFailure({ study: 'has no code submission to review.' })
    }
    if (!REVIEWABLE_CODE_JOB_STATUSES.includes(latestStatus)) {
        throw new ActionFailure({ study: 'code is no longer in a reviewable state.' })
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

        const claimedJob = await claimInitialCodeReviewJob({ db, studyId })

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
                })
                .executeTakeFirstOrThrow()
        } catch (err) {
            // Postgres unique_violation (SQLSTATE 23505). The composite unique
            // index on (studyJobId, reviewKind) fires when two reviewers race
            // through claimInitialCodeReviewJob and both reach this insert
            // before either commits. The race-loser sees this; the data is
            // already safe, so surface a clean message instead of the raw
            // duplicate-key error.
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

        if (decision === 'approve') {
            await approveJobCode({ db, job: claimedJob, study, userId, studyId, orgSlug })
            await db
                .updateTable('study')
                .set({ status: 'APPROVED', rejectedAt: null, reviewerId: userId })
                .where('id', '=', studyId)
                .execute()
            onStudyCodeApproved({ studyId, userId })
        } else if (decision === 'reject') {
            await performStudyCodeRejection({ db, studyId, userId })
        } else {
            // Clarification: append CODE-CHANGES-REQUESTED on the job (so the
            // pill flips to "Change requested") and move the study back to
            // APPROVED. The proposal was already approved (approvedAt set);
            // we restore that resting state so claimInitialCodeReviewJob's
            // PENDING-REVIEW check blocks any further code-review submissions
            // on this job until the researcher resubmits.
            await db
                .insertInto('jobStatusChange')
                .values({ userId, status: 'CODE-CHANGES-REQUESTED', studyJobId: claimedJob.id })
                .executeTakeFirstOrThrow()
            await db
                .updateTable('study')
                .set({ status: 'APPROVED', rejectedAt: null, reviewerId: userId })
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
            .select(['orgId', 'submittedByOrgId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId }, db }) => {
        // Each code job, in creation order, is its own review round (v1, v2, ...).
        // Reviewer decisions on a job and the researcher's resubmission note on
        // that same job share the round number. studyJob has no userId column;
        // the author of the resubmission note is the user recorded on the
        // CODE-SUBMITTED status change for that job.
        const codeJobs = await db
            .selectFrom('studyJob')
            .leftJoin('jobStatusChange as submission', (join) =>
                join.onRef('submission.studyJobId', '=', 'studyJob.id').on('submission.status', '=', 'CODE-SUBMITTED'),
            )
            .leftJoin('user as author', 'author.id', 'submission.userId')
            .select([
                'studyJob.id as studyJobId',
                'studyJob.resubmissionNote',
                'studyJob.createdAt',
                'submission.userId as authorId',
                'author.fullName as authorName',
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
                'studyReviewComment.studyJobId',
                'studyReviewComment.entryType',
                'studyReviewComment.decision',
                'studyReviewComment.body',
                'studyReviewComment.criteria',
                'studyReviewComment.createdAt',
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
            version: row.studyJobId ? (jobVersion.get(row.studyJobId) ?? null) : null,
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
                createdAt: j.createdAt,
                authorName: j.authorName ?? '',
                version: jobVersion.get(j.studyJobId) ?? null,
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
