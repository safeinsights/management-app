'use server'

import { ActionFailure, isPgUniqueViolation, throwNotFound } from '@/lib/errors'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { assertDecisionFeedback } from './decision-feedback'
import { toReviewDecision } from '@/lib/review-decision'
import { codeReviewFeedbackDocName } from '@/lib/collaboration-documents'
import { isCodeUnderReviewStatus, latestCodeChangeIsSubmission } from '@/lib/study-job-status'
import { MAX_SAVE_INTERVAL_MS } from '../../../services/editor/constants'
import { sleep } from '@/lib/utils'
import { codeSubmissionVersion, latestJobForStudyOrNull, fetchUserFullName } from '@/server/db/queries'
import { markStudyUpdated } from '@/server/db/mutations'
import { purgeCodeReviewFeedbackYjsDoc } from '@/server/db/yjs-cleanup'
import { deferred, onStudyCodeApproved, onStudyCodeChangesRequested } from '@/server/events'
import { Action, z } from './action'
import { requireStudyAgreement } from '@/server/study-agreement'
import { currentDb } from '@/server/request-context'
import { approveJobCode } from '@/server/job-code-approval'

// The delay must outlast Hocuspocus MAX_SAVE_INTERVAL_MS so the sweep runs after the worst-case
// debounced store and disconnect-flush. Job-keyed names are never reused, so the delete is unconditional.
const CODE_REVIEW_PURGE_DELAY_MS = MAX_SAVE_INTERVAL_MS + 5_000
const purgeCodeReviewFeedbackYjsDocAfterSubmit = deferred(async (args: { jobId: string }) => {
    await sleep({ [CODE_REVIEW_PURGE_DELAY_MS]: 'ms' })
    await purgeCodeReviewFeedbackYjsDoc(currentDb(), args)
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
    privacyProtection: z.enum(['yes', 'no', 'not-sure']),
})

export const submitCodeReviewDecisionAction = new Action('submitCodeReviewDecisionAction', { performsMutations: true })
    .params(
        z.object({
            studyId: z.uuid(),
            orgSlug: z.string(),
            feedback: z.string(),
            decision: z.enum(['approve', 'needs-clarification']),
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

        const submitterFullName = await fetchUserFullName(userId, db)

        await db.deleteFrom('yjsDocument').where('name', '=', codeReviewFeedbackDocName(claimedJob.id)).execute()

        // Re-asserts APPROVED to self-heal legacy rows still at PENDING-REVIEW with approvedAt set.
        if (decision === 'approve') {
            await approveJobCode({ db, job: claimedJob, study, userId, studyId, orgSlug })
            await markStudyUpdated(db, {
                studyId,
                userId,
                set: { status: 'APPROVED', rejectedAt: null, reviewerId: userId },
            })
            onStudyCodeApproved({ studyId, userId, studyJobId: claimedJob.id })
        } else {
            await db
                .insertInto('jobStatusChange')
                .values({ userId, status: 'CODE-CHANGES-REQUESTED', studyJobId: claimedJob.id })
                .executeTakeFirstOrThrow()
            await markStudyUpdated(db, {
                studyId,
                userId,
                set: { status: 'APPROVED', rejectedAt: null, reviewerId: userId },
            })
            onStudyCodeChangesRequested({ studyId, userId, studyJobId: claimedJob.id })
        }

        purgeCodeReviewFeedbackYjsDocAfterSubmit({ jobId: claimedJob.id })

        return { submitterFullName }
    })
