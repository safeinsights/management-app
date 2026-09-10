'use server'

import { db as database, type DBExecutor, jsonArrayFrom } from '@/database'
import { sql } from 'kysely'
import { ActionFailure, isPgUniqueViolation, throwNotFound } from '@/lib/errors'
import { ActionSuccessType, sharedFileSchema, type SharedFile } from '@/lib/types'
import type { StudyReviewCommentKind, StudyStatus } from '@/database/types'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { assertDecisionFeedback } from './decision-feedback'
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
import { hasStep2CollabDocSql } from '@/server/db/step2-collab-doc'
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
import { requireStudyAgreement } from '@/server/study-agreement'

const studyViewMiddleware = async ({ params: { studyId }, db }: { params: { studyId: string }; db: DBExecutor }) => {
    const study = await db
        .selectFrom('study')
        .select(['orgId', 'submittedByOrgId', 'status'])
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow(throwNotFound('study'))
    return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
}

// Soft-delete applies to DRAFTs only and is scoped to dashboard listings; direct reads by id stay
// lifecycle-agnostic, so stale editor tabs and bookmarked URLs remain a known gap.
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
                    // v7 id breaks createdAt ties so the job picked here is deterministic.
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
        .select(hasStep2CollabDocSql.as('hasStep2CollabDoc'))
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
    })

export const fetchStudiesForCurrentResearcherUserAction = new Action('fetchStudiesForCurrentResearcherUserAction')
    .requireAbilityTo('view', 'Studies')
    .handler(async ({ db, session }) => {
        const userId = session.user.id
        return fetchStudyQuery(db)
            .where((eb) => eb.or([eb('study.status', '!=', 'DRAFT'), eb('study.researcherId', '=', userId)]))
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
            .where('study.status', '!=', 'DRAFT')
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
                'org.name as orgName',
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

        // Scoped to the rendered role: a user in both orgs would otherwise ack both columns at
        // once, silently consuming the reviewer's gate (OTTER-546).
        const requiredOrgId = role === 'reviewer' ? study.orgId : study.submittedByOrgId
        // SI admins review studies for orgs they do not belong to; the researcher path stays
        // membership-only.
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
        // Persist only the per-researcher wrapped AES keys; ciphertext is untouched.
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
    // PENDING-REVIEW + approvedAt IS NULL blocks flipping a DRAFT into a viewable status
    // (OTTER-596), and being atomic settles the OTTER-471 concurrent-decision race.
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
    // Same PENDING-REVIEW gate as approval (OTTER-596); atomic for the OTTER-471 race.
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
        // Excludes legacy rows left at PENDING-REVIEW by the retired code-submit status flip:
        // those are code-stage and must not be claimable for a proposal review.
        .where('approvedAt', 'is', null)
        .returning(['status', 'approvedAt', 'orgId', 'containerLocation'])
        .executeTakeFirst()

    if (!study) {
        // OTTER-471 race-loser. User-facing wording: surfaces via errorToString to a toast.
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

// A debounced Hocuspocus persist can commit after the in-tx delete; re-delete rows older than the
// submit timestamp, so a fast clarification -> reopen cycle inside 5s survives.
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
            // Revalidated server-side so a stale tab cannot write into the wrong round.
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
        const json = assertDecisionFeedback(feedback, {
            fieldTitle: REVIEW_FEEDBACK_FIELD_TITLE,
            maxCharacters: REVIEW_FEEDBACK_MAX_CHARACTERS,
        })

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

        // The next round starts fresh from its own -v{N+1} name.
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

// The delay must outlast Hocuspocus MAX_SAVE_INTERVAL_MS so the sweep runs after the worst-case
// debounced store and disconnect-flush. Job-keyed names are never reused, so the delete is unconditional.
const CODE_REVIEW_PURGE_DELAY_MS = MAX_SAVE_INTERVAL_MS + 5_000
const purgeCodeReviewFeedbackYjsDocAfterSubmit = deferred(async (args: { jobId: string }) => {
    await sleep({ [CODE_REVIEW_PURGE_DELAY_MS]: 'ms' })
    await purgeCodeReviewFeedbackYjsDoc(database, args)
})

async function claimInitialCodeReviewJob({ studyId }: { studyId: string }) {
    // study.status stays APPROVED while code is (re)submitted, so job status is the only correct
    // gate. Counting submissions vs decisions keeps it immune to createdAt/v7-id tie ordering.
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
    .middleware(requireStudyAgreement(({ params }) => params.studyId))
    .handler(async ({ params: { studyId, orgSlug, feedback, decision, criteria }, study, session, db }) => {
        const userId = session.user.id

        const json = assertDecisionFeedback(feedback, {
            fieldTitle: REVIEW_FEEDBACK_FIELD_TITLE,
            maxCharacters: REVIEW_FEEDBACK_MAX_CHARACTERS,
        })

        const claimedJob = await claimInitialCodeReviewJob({ studyId })

        // Round = study-wide submission version, so each round gets its own row under the
        // (studyJobId, reviewKind, round) unique index (OTTER-316/638).
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
            // Fires when two reviewers race through claimInitialCodeReviewJob in the same round.
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

        // Re-asserts APPROVED to self-heal legacy rows still at PENDING-REVIEW with approvedAt set.
        if (decision === 'approve') {
            await approveJobCode({ db, job: claimedJob, study, userId, studyId, orgSlug })
            await db
                .updateTable('study')
                .set({ status: 'APPROVED', rejectedAt: null, reviewerId: userId, lastUpdatedAt: new Date() })
                .where('id', '=', studyId)
                .execute()
            onStudyCodeApproved({ studyId, userId })
        } else if (decision === 'reject') {
            // Rejecting code fails the job, not the proposal; the study stays APPROVED (OTTER-603).
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

// Shared by the code and outputs feedback actions so shape, version labels and ordering cannot drift.
async function loadReviewFeedbackThread(
    db: DBExecutor,
    studyId: string,
    reviewKind: Extract<StudyReviewCommentKind, 'CODE' | 'RESULTS'>,
) {
    // Versioned by the study-wide round so a same-job resubmit keeps the same label. Lateral join
    // because a same-job resubmit appends several CODE-SUBMITTED rows and a direct join would duplicate.
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
        .where('studyReviewComment.reviewKind', '=', reviewKind)
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
            // Written at resubmit time, so the latest CODE-SUBMITTED timestamp positions it.
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
}

export const getCodeReviewFeedbackAction = new Action('getCodeReviewFeedbackAction')
    .params(z.object({ studyId: z.string().uuid() }))
    .middleware(studyViewMiddleware)
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId }, db }) => loadReviewFeedbackThread(db, studyId, 'CODE'))

export type CodeReviewFeedbackEntry = ActionSuccessType<typeof getCodeReviewFeedbackAction>[number]

// Distinct from getOutputsDecisionFeedbackAction, which returns decisions alone for the reviewer.
export const getOutputsFeedbackThreadAction = new Action('getOutputsFeedbackThreadAction')
    .params(z.object({ studyId: z.string().uuid() }))
    .middleware(studyViewMiddleware)
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId }, db }) => loadReviewFeedbackThread(db, studyId, 'RESULTS'))

export type OutputsFeedbackThreadEntry = ActionSuccessType<typeof getOutputsFeedbackThreadAction>[number]

export const getOutputsDecisionFeedbackAction = new Action('getOutputsDecisionFeedbackAction')
    .params(z.object({ studyId: z.string().uuid() }))
    .middleware(studyViewMiddleware)
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId }, db }) => {
        const rows = await db
            .selectFrom('studyReviewComment')
            .innerJoin('user as author', 'author.id', 'studyReviewComment.authorId')
            .select([
                'studyReviewComment.id',
                'studyReviewComment.authorId',
                'studyReviewComment.decision',
                'studyReviewComment.body',
                'studyReviewComment.createdAt',
                'studyReviewComment.round',
                'author.fullName as authorName',
            ])
            .where('studyReviewComment.studyId', '=', studyId)
            .where('studyReviewComment.reviewKind', '=', 'RESULTS')
            .where('studyReviewComment.entryType', '=', 'DECISION')
            .orderBy('studyReviewComment.createdAt', 'desc')
            .execute()

        // Outputs decisions carry no criteria, unlike code reviews.
        return rows.map((row) => ({
            id: row.id,
            authorId: row.authorId,
            entryType: 'REVIEWER-FEEDBACK' as const,
            decision: row.decision,
            body: row.body,
            createdAt: row.createdAt,
            authorName: row.authorName,
            version: row.round ?? null,
        }))
    })

export type OutputsDecisionFeedbackEntry = ActionSuccessType<typeof getOutputsDecisionFeedbackAction>[number]

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
