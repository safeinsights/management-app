'use server'

import { type DBExecutor, jsonArrayFrom } from '@/database'
import { sql } from 'kysely'
import { ActionFailure, throwNotFound } from '@/lib/errors'
import { ActionSuccessType, jobFileSchema } from '@/lib/types'
import type { StudyStatus } from '@/database/types'
import { countWordsFromLexical, lexicalJson } from '@/lib/word-count'
import { FEEDBACK_MAX_WORDS, FEEDBACK_MIN_WORDS, toReviewDecision, type Decision } from '@/lib/proposal-review'
import {
    getProposalFeedbackForStudy,
    getStudyJobFileOfType,
    latestJobForStudy,
    type LatestJobForStudy,
} from '@/server/db/queries'
import {
    onStudyApproved,
    onStudyCodeApproved,
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
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['id', 'orgId', 'submittedByOrgId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ study, params: { studyId }, db, session }) => {
        const userOrgIds = new Set(Object.values(session?.orgs ?? {}).map((org) => org.id))

        const isReviewer = userOrgIds.has(study.orgId)
        const isResearcher = userOrgIds.has(study.submittedByOrgId)

        if (!isReviewer && !isResearcher) {
            throw new ActionFailure({ user: 'not a member of the study reviewer or submitter org' })
        }

        if (isReviewer) {
            await db
                .updateTable('study')
                .set({ reviewerAgreementsAckedAt: new Date() })
                .where('id', '=', studyId)
                .where('reviewerAgreementsAckedAt', 'is', null)
                .execute()
        }
        if (isResearcher) {
            await db
                .updateTable('study')
                .set({ researcherAgreementsAckedAt: new Date() })
                .where('id', '=', studyId)
                .where('researcherAgreementsAckedAt', 'is', null)
                .execute()
        }
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
        throw new ActionFailure({ study: 'must be in initial proposal review before submitting a proposal review' })
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
        })
        .executeTakeFirstOrThrow()
}

export const submitProposalReviewAction = new Action('submitProposalReviewAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.string(),
            orgSlug: z.string(),
            feedback: z.string(),
            decision: z.enum(['approve', 'needs-clarification', 'reject']),
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
    .handler(async ({ params: { studyId, orgSlug, feedback, decision }, session, db }) => {
        const userId = session.user.id
        const { json, wordCount } = normalizeFeedbackToLexical(feedback)

        if (wordCount < FEEDBACK_MIN_WORDS || wordCount > FEEDBACK_MAX_WORDS) {
            throw new ActionFailure({
                feedback: `must be between ${FEEDBACK_MIN_WORDS} and ${FEEDBACK_MAX_WORDS} words (got ${wordCount})`,
            })
        }

        const claimedStudy = await claimInitialProposalReviewStudy({ db, studyId, userId })
        await insertReviewerProposalComment({ db, studyId, userId, decision, body: json })

        const submitter = await db
            .selectFrom('user')
            .select(['fullName'])
            .where('id', '=', userId)
            .executeTakeFirstOrThrow()

        if (decision === 'approve') {
            await performStudyProposalApproval({ db, study: claimedStudy, studyId, userId, orgSlug })
            return { submitterFullName: submitter.fullName }
        }

        if (decision === 'reject') {
            await performStudyProposalRejection({ db, studyId, userId })
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
